import type {
  Discipline,
  RulesDocument,
  Task,
  TaskColumn,
  TaskType,
} from '../domain';
import { parseRulesJson, validateRulesDocument } from '../domain';
import {
  aiCommandSchema,
  proposalSchema,
  type AiCommand,
  type AiCommandBatch,
  type AiPlannedCommand,
  type AiTaskCreation,
  type Proposal,
} from '../shared/ai-commands';

export interface AiSnapshot {
  readonly revision: number;
  readonly ruleVersions: Readonly<Record<string, string>>;
  readonly tasks: readonly Task[];
  readonly columns: readonly TaskColumn[];
  readonly taskTypes: readonly TaskType[];
  readonly disciplines: readonly Discipline[];
  readonly rules: readonly RulesDocument[];
}

export interface RejectedAiCommand {
  readonly index: number;
  readonly kind: string;
  readonly reason: string;
}

export interface ProposalValidation {
  readonly validCommands: readonly AiCommand[];
  readonly rejectedCommands: readonly RejectedAiCommand[];
}

export function isStale(
  proposal: Pick<Proposal, 'baseRevision' | 'ruleVersions'>,
  currentRevision: number,
  currentRuleVersions: Readonly<Record<string, string>>,
): boolean {
  const expected = Object.entries(proposal.ruleVersions).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const current = Object.entries(currentRuleVersions).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return (
    proposal.baseRevision !== currentRevision ||
    JSON.stringify(expected) !== JSON.stringify(current)
  );
}

export function validateProposal(
  proposal: unknown,
  snapshot: AiSnapshot,
): ProposalValidation {
  const parsed = proposalSchema.safeParse(proposal);
  if (!parsed.success) {
    return {
      validCommands: [],
      rejectedCommands: [
        { index: -1, kind: 'proposal', reason: 'invalid-proposal' },
      ],
    };
  }
  if (isStale(parsed.data, snapshot.revision, snapshot.ruleVersions)) {
    return {
      validCommands: [],
      rejectedCommands: parsed.data.commands.map((command, index) => ({
        index,
        kind: commandKind(command),
        reason: 'stale-proposal',
      })),
    };
  }
  const validCommands: AiCommand[] = [];
  const rejectedCommands: RejectedAiCommand[] = [];
  const knownTaskIds = new Set(snapshot.tasks.map((task) => task.id));
  parsed.data.commands.forEach((candidate, index) => {
    const parsedCommand = aiCommandSchema.safeParse(candidate);
    if (!parsedCommand.success) {
      rejectedCommands.push({
        index,
        kind: commandKind(candidate),
        reason: 'invalid-command',
      });
      return;
    }
    const command = parsedCommand.data;
    const reason = validateCommand(command, snapshot, knownTaskIds);
    if (reason) {
      rejectedCommands.push({ index, kind: command.kind, reason });
      return;
    }
    validCommands.push(command);
    if (command.kind === 'task.create') knownTaskIds.add(command.task.id);
  });
  return { validCommands, rejectedCommands };
}

function commandKind(command: unknown): string {
  if (typeof command !== 'object' || command === null || !('kind' in command))
    return 'unknown';
  return typeof command.kind === 'string' ? command.kind : 'unknown';
}
function validateCommand(
  command: AiCommand,
  snapshot: AiSnapshot,
  knownTaskIds: ReadonlySet<string>,
): string | undefined {
  return hasMissingTask(command, snapshot)
    ? 'task-not-found'
    : validateCommandKind(command, snapshot, knownTaskIds);
}

export function toStorageCommands(
  commands: readonly AiCommand[],
  snapshot: AiSnapshot,
): AiCommandBatch {
  let nextAddedOrder =
    snapshot.tasks.reduce(
      (highest, existing) => Math.max(highest, existing.addedOrder),
      -1,
    ) + 1;
  const plannedCommands: AiPlannedCommand[] = commands.map((command) => {
    if (command.kind !== 'task.create') return command;
    const task = buildTask(command.task, snapshot, nextAddedOrder);
    nextAddedOrder += 1;
    return { kind: 'task.create', task };
  });
  return { commands: plannedCommands, source: 'ai' };
}

function hasMissingTask(command: AiCommand, snapshot: AiSnapshot): boolean {
  const taskId = taskIdFor(command);
  return (
    taskId !== undefined && !snapshot.tasks.some((task) => task.id === taskId)
  );
}

function validateCommandKind(
  command: AiCommand,
  snapshot: AiSnapshot,
  knownTaskIds: ReadonlySet<string>,
): string | undefined {
  switch (command.kind) {
    case 'task.create':
      return validateCreatedTask(command.task, snapshot, knownTaskIds);
    case 'task.update':
      return undefined;
    case 'task.move':
      return validateMove(command, snapshot.columns);
    case 'subtask.add':
    case 'comment.add':
    case 'task.setAiRank':
      return undefined;
    case 'task.classify':
      return validateClassification(command, snapshot);
    case 'rule.import':
      return validateRuleImport(command.documentJson, snapshot);
    case 'rule.activate':
      return validateRuleActivation(command.ruleId, snapshot.rules);
  }
}

function validateRuleActivation(
  ruleId: string,
  rules: readonly RulesDocument[],
): string | undefined {
  return rules.some((rule) => rule.id === ruleId)
    ? undefined
    : 'rule-not-found';
}

function taskIdFor(command: AiCommand): string | undefined {
  switch (command.kind) {
    case 'task.create':
    case 'rule.import':
    case 'rule.activate':
      return undefined;
    case 'task.update':
    case 'task.move':
      return command.id;
    case 'subtask.add':
    case 'comment.add':
    case 'task.classify':
    case 'task.setAiRank':
      return command.taskId;
  }
}

function validateCreatedTask(
  task: AiTaskCreation,
  snapshot: AiSnapshot,
  knownTaskIds: ReadonlySet<string>,
): string | undefined {
  if (knownTaskIds.has(task.id)) return 'task-id-conflict';
  const column = snapshot.columns.find(
    (candidate) => candidate.id === task.columnId,
  );
  if (!column) return 'column-not-found';
  if (
    task.typeId &&
    !snapshot.taskTypes.some((type) => type.id === task.typeId)
  )
    return 'type-not-found';
  if (
    task.disciplineId &&
    !snapshot.disciplines.some(
      (discipline) => discipline.id === task.disciplineId,
    )
  )
    return 'discipline-not-found';
  return column.state === 'waiting' ? 'waiting-reason-required' : undefined;
}

function buildTask(
  task: AiTaskCreation,
  snapshot: AiSnapshot,
  addedOrder: number,
): Task {
  const column = snapshot.columns.find(
    (candidate) => candidate.id === task.columnId,
  );
  if (!column || column.state === 'waiting')
    throw new Error('Cannot build an AI task without a supported column');
  const { comment, ...fields } = task;
  return {
    ...fields,
    status: { kind: column.state },
    comments: comment ? [comment] : [],
    attachments: [],
    addedOrder,
  };
}

function validateMove(
  command: Extract<AiCommand, { kind: 'task.move' }>,
  columns: readonly TaskColumn[],
): string | undefined {
  const column = columns.find((candidate) => candidate.id === command.columnId);
  if (!column) return 'column-not-found';
  const status = command.status;
  if (
    column.state === 'waiting' &&
    (!status || status.kind !== 'waiting' || !status.reason.trim())
  )
    return 'waiting-reason-required';
  if (status && status.kind !== column.state) return 'status-column-mismatch';
  return undefined;
}

function validateClassification(
  command: Extract<AiCommand, { kind: 'task.classify' }>,
  snapshot: AiSnapshot,
): string | undefined {
  if (
    command.typeId &&
    !snapshot.taskTypes.some((type) => type.id === command.typeId)
  )
    return 'type-not-found';
  if (
    command.disciplineId &&
    !snapshot.disciplines.some(
      (discipline) => discipline.id === command.disciplineId,
    )
  )
    return 'discipline-not-found';
  return undefined;
}

function validateRuleImport(
  documentJson: string,
  snapshot: AiSnapshot,
): string | undefined {
  const parsed = parseRulesJson(documentJson);
  if (!parsed.ok) return 'invalid-rule-document';
  const validated = validateRulesDocument(parsed.value);
  if (!validated.ok) return 'invalid-rule-document';
  const document = validated.document;
  if (
    document.scope.task_type_ids.some(
      (id) => !snapshot.taskTypes.some((type) => type.id === id),
    )
  )
    return 'type-not-found';
  if (
    (document.scope.discipline_ids ?? []).some(
      (id) => !snapshot.disciplines.some((discipline) => discipline.id === id),
    )
  )
    return 'discipline-not-found';
  return undefined;
}
