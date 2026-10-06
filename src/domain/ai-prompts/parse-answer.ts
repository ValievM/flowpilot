import { z } from 'zod';
import { validateRulesDocument } from '../rules';
import type {
  AnswerIds,
  CreateCardsAnswer,
  NowAnswer,
  NowAnswerIds,
  ParseAnswerResult,
  ReplanAnswer,
  RuleEditAnswer,
  RuleEditIds,
} from './answer-types';

const estimateSchema = z
  .object({ unit: z.literal('workdays'), value: z.number().int().min(1) })
  .strict();
const nowSchema = z
  .object({
    action: z
      .object({
        taskId: z.string().min(1),
        subtaskId: z.string().min(1).optional(),
      })
      .strict()
      .nullable(),
    reason: z.string().trim().min(1),
  })
  .strict();
const cardSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    day: z.iso.date().optional(),
    deadline: z.iso.date().optional(),
    estimate: estimateSchema.optional(),
    subtasks: z.array(z.object({ title: z.string().trim().min(1) }).strict()),
  })
  .strict();
const createCardsSchema = z
  .object({
    cards: z.array(cardSchema),
    unknowns: z.array(z.string().trim().min(1)),
  })
  .strict();
const updateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    day: z.iso.date().nullable().optional(),
    deadline: z.iso.date().nullable().optional(),
    estimate: estimateSchema.nullable().optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0);
const replanCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('task.move'),
      id: z.string().min(1),
      columnId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('task.update'),
      id: z.string().min(1),
      changes: updateSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('task.setAiRank'),
      taskId: z.string().min(1),
      rank: z.number().int().min(0),
    })
    .strict(),
]);
const replanSchema = z
  .object({
    commands: z.array(replanCommandSchema),
    rationale: z.string().trim().min(1),
  })
  .strict();
const ruleEditSchema = z
  .object({ document: z.unknown(), taskId: z.string().min(1) })
  .strict();

export function parseAnswerNow(
  value: unknown,
  ids: NowAnswerIds,
): ParseAnswerResult<NowAnswer> {
  const parsed = nowSchema.safeParse(value);
  if (!parsed.success) return failure(parsed.error.message);
  const error = nowActionError(parsed.data.action, ids);
  return error ? failure(error) : { ok: true, value: parsed.data };
}

function nowActionError(
  action: NowAnswer['action'],
  ids: NowAnswerIds,
): string | undefined {
  if (!action)
    return ids.availableTaskIds.length > 0
      ? 'An available action is required'
      : undefined;
  if (!ids.availableTaskIds.includes(action.taskId))
    return 'Action taskId is not available';
  if (!ids.taskIds.includes(action.taskId))
    return 'Action taskId is not supplied';
  const subtaskId = action.subtaskId;
  if (
    subtaskId &&
    !(ids.subtasksByTask ?? []).some(
      ({ taskId, subtaskIds }) =>
        taskId === action.taskId && subtaskIds.includes(subtaskId),
    )
  )
    return 'Action subtaskId is not supplied for taskId';
  return undefined;
}

export function parseAnswerCreateCards(
  value: unknown,
): ParseAnswerResult<CreateCardsAnswer> {
  return parse(createCardsSchema, value);
}

export function parseAnswerReplan(
  value: unknown,
  ids: AnswerIds,
): ParseAnswerResult<ReplanAnswer> {
  const parsed = replanSchema.safeParse(value);
  if (!parsed.success) return failure(parsed.error.message);
  const taskIds = new Set(ids.taskIds);
  const columnIds = new Set(ids.columnIds ?? []);
  for (const command of parsed.data.commands) {
    if (command.kind === 'task.setAiRank') {
      if (!taskIds.has(command.taskId))
        return failure(`Unknown task ID: ${command.taskId}`);
    } else {
      if (!taskIds.has(command.id))
        return failure(`Unknown task ID: ${command.id}`);
      if (command.kind === 'task.move' && !columnIds.has(command.columnId))
        return failure(`Unknown column ID: ${command.columnId}`);
    }
  }
  return { ok: true, value: parsed.data };
}

export function parseAnswerRuleEdit(
  value: unknown,
  ids: RuleEditIds,
): ParseAnswerResult<RuleEditAnswer> {
  const parsed = ruleEditSchema.safeParse(value);
  if (!parsed.success) return failure(parsed.error.message);
  if (!ids.taskIds.includes(parsed.data.taskId))
    return failure(`Unknown task ID: ${parsed.data.taskId}`);
  const validated = validateRulesDocument(parsed.data.document);
  if (!validated.ok) return failure('Invalid rule document');
  if (
    validated.document.scope.task_type_ids.some(
      (id) => !ids.taskTypeIds.includes(id),
    )
  )
    return failure('Unknown task type ID');
  if (
    validated.document.scope.discipline_ids?.some(
      (id) => !ids.disciplineIds.includes(id),
    )
  )
    return failure('Unknown discipline ID');
  return {
    ok: true,
    value: { taskId: parsed.data.taskId, document: validated.document },
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): ParseAnswerResult<T> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : failure(parsed.error.message);
}

function failure(error: string): {
  readonly ok: false;
  readonly error: string;
} {
  return { ok: false, error };
}
