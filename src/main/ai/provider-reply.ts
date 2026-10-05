import { parseRulesJson, validateRulesDocument } from '../../domain';
import { z } from 'zod';
import {
  aiCommandSchema,
  proposalSchema,
  type AiCommand,
  type Proposal,
} from '../../shared/ai-commands';
import type { ProviderResult } from './ai-provider';

const contextNestedSchema = z.looseObject({ id: z.string().min(1) });
const contextTaskSchema = z.looseObject({
  id: z.string().min(1),
  subtasks: z.array(contextNestedSchema).optional(),
  comments: z.array(contextNestedSchema).optional(),
});
const contextColumnSchema = z.looseObject({ id: z.string().min(1) });
const contextTypeSchema = z.looseObject({ id: z.string().min(1) });
const contextSchema = z.looseObject({
  tasks: z.array(contextTaskSchema),
  columns: z.array(contextColumnSchema).optional(),
  taskTypes: z.array(contextTypeSchema).optional(),
  disciplines: z.array(contextTypeSchema).optional(),
  rules: z.array(contextTypeSchema).optional(),
});
interface ValidationState {
  readonly columnIds: Set<string>;
  readonly taskTypeIds: Set<string>;
  readonly disciplineIds: Set<string>;
  readonly ruleIds: Set<string>;
  readonly taskIds: Set<string>;
  readonly subtaskIds: Set<string>;
  readonly commentIds: Set<string>;
}

export function validateProviderReply(
  value: unknown,
  context: unknown,
): ProviderResult<Proposal> {
  const parsed = proposalSchema.safeParse(value);
  const parsedContext = contextSchema.safeParse(context);
  if (!parsed.success || !parsedContext.success) return invalidReply();
  const state = createValidationState(parsedContext.data);
  const commands: AiCommand[] = [];
  for (const candidate of parsed.data.commands) {
    const command = aiCommandSchema.safeParse(candidate);
    if (!command.success || !isCommandValid(command.data, state)) {
      return invalidReply();
    }
    commands.push(command.data);
  }
  return { ok: true, value: { ...parsed.data, commands } };
}

export function parseProviderText(
  text: string,
  context: unknown,
): ProviderResult<Proposal> {
  try {
    const value: unknown = JSON.parse(text);
    return validateProviderReply(value, context);
  } catch {
    return invalidReply();
  }
}

function createValidationState(
  context: z.infer<typeof contextSchema>,
): ValidationState {
  const { tasks } = context;
  return {
    columnIds: new Set((context.columns ?? []).map(({ id }) => id)),
    taskTypeIds: new Set((context.taskTypes ?? []).map(({ id }) => id)),
    disciplineIds: new Set((context.disciplines ?? []).map(({ id }) => id)),
    ruleIds: new Set((context.rules ?? []).map(({ id }) => id)),
    taskIds: new Set(tasks.map(({ id }) => id)),
    subtaskIds: new Set(
      tasks.flatMap(({ subtasks = [] }) => subtasks.map(({ id }) => id)),
    ),
    commentIds: new Set(
      tasks.flatMap(({ comments = [] }) => comments.map(({ id }) => id)),
    ),
  };
}

function isCommandValid(command: AiCommand, state: ValidationState): boolean {
  if (command.kind === 'task.create') return acceptCreatedTask(command, state);
  if (!hasValidCommandReferences(command, state)) return false;
  const taskId = taskIdFor(command);
  if (taskId !== undefined && !state.taskIds.has(taskId)) return false;
  if (command.kind === 'subtask.add') {
    if (state.subtaskIds.has(command.subtask.id)) return false;
    state.subtaskIds.add(command.subtask.id);
    return true;
  }
  if (command.kind === 'comment.add') {
    if (state.commentIds.has(command.comment.id)) return false;
    state.commentIds.add(command.comment.id);
    return true;
  }
  return true;
}

function hasValidCommandReferences(
  command: Exclude<AiCommand, { kind: 'task.create' }>,
  state: ValidationState,
): boolean {
  switch (command.kind) {
    case 'task.move':
      return state.columnIds.has(command.columnId);
    case 'task.classify':
      return (
        (!command.typeId || state.taskTypeIds.has(command.typeId)) &&
        (!command.disciplineId || state.disciplineIds.has(command.disciplineId))
      );
    case 'rule.activate':
      return state.ruleIds.has(command.ruleId);
    case 'rule.import':
      return hasValidRuleReferences(command.documentJson, state);
    default:
      return true;
  }
}
function hasValidRuleReferences(
  documentJson: string,
  state: ValidationState,
): boolean {
  const parsed = parseRulesJson(documentJson);
  if (!parsed.ok) return false;
  const validated = validateRulesDocument(parsed.value);
  if (!validated.ok) return false;
  const { scope } = validated.document;
  return (
    scope.task_type_ids.every((id) => state.taskTypeIds.has(id)) &&
    (scope.discipline_ids ?? []).every((id) => state.disciplineIds.has(id))
  );
}

function hasValidCreatedTaskReferences(
  task: Extract<AiCommand, { kind: 'task.create' }>['task'],
  state: ValidationState,
): boolean {
  return (
    (task.typeId === undefined || state.taskTypeIds.has(task.typeId)) &&
    (task.disciplineId === undefined ||
      state.disciplineIds.has(task.disciplineId)) &&
    state.columnIds.has(task.columnId)
  );
}
function acceptCreatedTask(
  command: Extract<AiCommand, { kind: 'task.create' }>,
  state: ValidationState,
): boolean {
  const { task } = command;
  const subtaskIds = task.subtasks.map(({ id }) => id);
  const commentId = task.comment?.id;
  if (
    !hasValidCreatedTaskReferences(task, state) ||
    state.taskIds.has(task.id) ||
    !areUniqueIds(subtaskIds, state.subtaskIds) ||
    (commentId !== undefined && state.commentIds.has(commentId))
  ) {
    return false;
  }
  state.taskIds.add(task.id);
  subtaskIds.forEach((id) => state.subtaskIds.add(id));
  if (commentId !== undefined) state.commentIds.add(commentId);
  return true;
}

function areUniqueIds(
  ids: readonly string[],
  existing: ReadonlySet<string>,
): boolean {
  const candidateIds = new Set<string>();
  for (const id of ids) {
    if (existing.has(id) || candidateIds.has(id)) return false;
    candidateIds.add(id);
  }
  return true;
}

function taskIdFor(command: AiCommand): string | undefined {
  switch (command.kind) {
    case 'task.update':
    case 'task.move':
      return command.id;
    case 'task.classify':
    case 'task.setAiRank':
    case 'subtask.add':
    case 'comment.add':
      return command.taskId;
    case 'rule.import':
    case 'rule.activate':
      return undefined;
    case 'task.create':
      return command.task.id;
  }
}
function invalidReply(): ProviderResult<Proposal> {
  return { ok: false, error: { kind: 'InvalidReply' } };
}
