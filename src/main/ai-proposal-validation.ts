import type {
  Discipline,
  RulesDocument,
  Task,
  TaskColumn,
  TaskType,
} from '../domain';
import { parseRulesJson, validateRulesDocument } from '../domain';
import { type AiCommand, type AiTaskCreation } from '../shared/ai-commands';

export interface AiSnapshot {
  readonly revision: number;
  readonly ruleVersions: Readonly<Record<string, string>>;
  readonly savedRuleIds: readonly string[];
  readonly tasks: readonly Task[];
  readonly columns: readonly TaskColumn[];
  readonly taskTypes: readonly TaskType[];
  readonly disciplines: readonly Discipline[];
  readonly rules: readonly RulesDocument[];
}

interface CommandValidationState {
  readonly snapshot: AiSnapshot;
  readonly taskIds: Set<string>;
  readonly subtaskIds: Set<string>;
  readonly commentIds: Set<string>;
  readonly ruleIds: Set<string>;
}

export function createValidationState(
  snapshot: AiSnapshot,
): CommandValidationState {
  return {
    snapshot,
    taskIds: new Set(snapshot.tasks.map((task) => task.id)),
    subtaskIds: new Set(
      snapshot.tasks.flatMap((task) => task.subtasks.map(({ id }) => id)),
    ),
    commentIds: new Set(
      snapshot.tasks.flatMap((task) => task.comments.map(({ id }) => id)),
    ),
    ruleIds: new Set(snapshot.savedRuleIds),
  };
}

export function validateCommand(
  command: AiCommand,
  state: CommandValidationState,
): string | undefined {
  const taskId = taskIdFor(command);
  return taskId !== undefined && !state.taskIds.has(taskId)
    ? 'task-not-found'
    : validateCommandKind(command, state);
}

export function recordCommandIds(
  command: AiCommand,
  state: CommandValidationState,
): void {
  switch (command.kind) {
    case 'task.create':
      state.taskIds.add(command.task.id);
      command.task.subtasks.forEach(({ id }) => state.subtaskIds.add(id));
      if (command.task.comment) state.commentIds.add(command.task.comment.id);
      return;
    case 'subtask.add':
      state.subtaskIds.add(command.subtask.id);
      return;
    case 'comment.add':
      state.commentIds.add(command.comment.id);
      return;
    default:
      return;
  }
}

function validateCommandKind(
  command: AiCommand,
  state: CommandValidationState,
): string | undefined {
  const { snapshot } = state;
  switch (command.kind) {
    case 'task.create':
      return validateCreatedTask(command.task, state);
    case 'task.update':
    case 'task.setAiRank':
      return undefined;
    case 'task.move':
      return validateMove(command, snapshot.columns);
    case 'subtask.add':
      return validateNestedId(
        command.subtask.id,
        state.subtaskIds,
        'subtask-id-conflict',
      );
    case 'comment.add':
      return validateNestedId(
        command.comment.id,
        state.commentIds,
        'comment-id-conflict',
      );
    case 'task.classify':
      return validateClassification(command, snapshot);
    case 'rule.import':
      return validateRuleImport(command.documentJson, snapshot);
    case 'rule.activate':
      return validateRuleActivation(command.ruleId, state.ruleIds);
  }
}

function validateNestedId(
  id: string,
  knownIds: ReadonlySet<string>,
  reason: string,
): string | undefined {
  return knownIds.has(id) ? reason : undefined;
}
function validateRuleActivation(
  ruleId: string,
  ruleIds: ReadonlySet<string>,
): string | undefined {
  return ruleIds.has(ruleId) ? undefined : 'rule-not-found';
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
  state: CommandValidationState,
): string | undefined {
  if (state.taskIds.has(task.id)) return 'task-id-conflict';
  if (
    hasDuplicateIds(
      task.subtasks.map(({ id }) => id),
      state.subtaskIds,
    )
  )
    return 'subtask-id-conflict';
  if (task.comment && state.commentIds.has(task.comment.id))
    return 'comment-id-conflict';
  if (task.typeId !== undefined || task.disciplineId !== undefined)
    return 'not-persisted-yet';
  return validateTaskReferences(task, state.snapshot);
}

function validateTaskReferences(
  task: AiTaskCreation,
  snapshot: AiSnapshot,
): string | undefined {
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

function hasDuplicateIds(
  ids: readonly string[],
  knownIds: ReadonlySet<string>,
): boolean {
  const seen = new Set<string>();
  return ids.some((id) => {
    if (knownIds.has(id) || seen.has(id)) return true;
    seen.add(id);
    return false;
  });
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
