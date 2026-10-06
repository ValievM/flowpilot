import type { TaskCreationDraft } from '../domain';
import {
  aiCommandSchema,
  proposalSchema,
  type AiCommand,
  type AiCommandBatch,
  type AiPlannedCommand,
  type AiTaskChanges,
  type AiTaskCreation,
  type Proposal,
} from '../shared/ai-commands';
import {
  createValidationState,
  recordCommandIds,
  validateCommand,
  type AiSnapshot,
} from './ai-proposal-validation';
export type { AiSnapshot } from './ai-proposal-validation';

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
  const state = createValidationState(snapshot);
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
    const reason = validateCommand(command, state);
    if (reason) {
      rejectedCommands.push({ index, kind: command.kind, reason });
      return;
    }
    validCommands.push(command);
    recordCommandIds(command, state);
  });
  return { validCommands, rejectedCommands };
}

export function cloneAiCommands(
  commands: readonly AiCommand[],
): readonly AiCommand[] {
  // Mutable records are copied; Temporal values are immutable.
  return commands.map(cloneAiCommand);
}

function cloneAiCommand(command: AiCommand): AiCommand {
  switch (command.kind) {
    case 'task.create':
      return { ...command, task: cloneTaskCreation(command.task) };
    case 'task.update':
      return { ...command, changes: cloneTaskChanges(command.changes) };
    case 'task.move':
      return cloneTaskMove(command);
    case 'subtask.add':
      return { ...command, subtask: { ...command.subtask } };
    case 'comment.add':
      return { ...command, comment: { ...command.comment } };
    case 'task.classify':
    case 'rule.import':
    case 'rule.activate':
    case 'task.setAiRank':
      return { ...command };
  }
}

function cloneTaskMove(
  command: Extract<AiCommand, { kind: 'task.move' }>,
): Extract<AiCommand, { kind: 'task.move' }> {
  return {
    ...command,
    ...(command.status ? { status: { ...command.status } } : {}),
  };
}

function cloneTaskCreation(task: AiTaskCreation): AiTaskCreation {
  return {
    ...task,
    ...(task.estimate ? { estimate: { ...task.estimate } } : {}),
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
    ...(task.comment ? { comment: { ...task.comment } } : {}),
  };
}

function cloneTaskChanges(changes: AiTaskChanges): AiTaskChanges {
  return {
    ...changes,
    ...(changes.estimate ? { estimate: { ...changes.estimate } } : {}),
  };
}

const UNSUPPORTED_COMMANDS: Record<string, true> = {
  'rule.import': true,
  'rule.activate': true,
  'task.classify': true,
};

export function findUnpersistedCommands(
  commands: readonly unknown[],
): RejectedAiCommand[] {
  const rejected: RejectedAiCommand[] = [];
  for (const [index, input] of commands.entries()) {
    const candidate = recordValue(input);
    const kind =
      candidate && typeof candidate.kind === 'string' ? candidate.kind : '';
    if (
      UNSUPPORTED_COMMANDS[kind] !== true &&
      !hasCatalogReference(kind, candidate)
    )
      continue;
    rejected.push({ index, kind, reason: 'not-persisted-yet' });
  }
  return rejected;
}

function hasCatalogReference(
  kind: string,
  candidate: Record<string, unknown> | undefined,
): boolean {
  if (kind !== 'task.create') return false;
  const task = recordValue(candidate?.task);
  return task?.typeId !== undefined || task?.disciplineId !== undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  // Proposal values are JSON objects at this boundary.
  return value as Record<string, unknown>;
}

function commandKind(command: unknown): string {
  if (typeof command !== 'object' || command === null || !('kind' in command))
    return 'unknown';
  return typeof command.kind === 'string' ? command.kind : 'unknown';
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

function buildTask(
  task: AiTaskCreation,
  snapshot: AiSnapshot,
  addedOrder: number,
): TaskCreationDraft {
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
