import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import {
  attachmentAddSchema,
  attachmentRemoveSchema,
} from './storage-command-schemas';
import {
  seriesCreateSchema,
  seriesRecordOutcomeSchema,
  seriesStopSchema,
  seriesUpdateSchema,
} from './series-command-schema';
import {
  disciplineCreateSchema,
  disciplineDeleteSchema,
  disciplineRenameSchema,
  ruleActivateSchema,
  ruleBindSchema,
  ruleDeactivateSchema,
  ruleImportSchema,
  subtaskMoveSchema,
  subtaskRemoveSchema,
  subtaskRenameSchema,
  taskClassifySchema,
  taskSetAiRankSchema,
  taskTypeCreateSchema,
  taskTypeDeleteSchema,
  taskTypeRenameSchema,
} from './storage-command-schemas';

const dateValueSchema = z.union([
  z.iso.date().transform((value) => Temporal.PlainDate.from(value)),
  z.custom<Temporal.PlainDate>((value) => value instanceof Temporal.PlainDate),
]);
const timeValueSchema = z.union([
  z.iso.time().transform((value) => Temporal.PlainTime.from(value)),
  z.custom<Temporal.PlainTime>((value) => value instanceof Temporal.PlainTime),
]);

const statusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('todo') }).strict(),
  z.object({ kind: z.literal('doing') }).strict(),
  z.object({ kind: z.literal('done') }).strict(),
  z
    .object({
      kind: z.literal('waiting'),
      reason: z.string().trim().min(1),
      until: dateValueSchema.optional(),
    })
    .strict(),
]);
const dateSchema = dateValueSchema.optional();
const timeSchema = timeValueSchema.optional();
const clearableDateSchema = dateValueSchema.nullable().optional();
const taskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    description: z.string().optional(),
    status: statusSchema,
    columnId: z.string().min(1),
    // typeId, disciplineId, and aiRank remain rejected until #40/#46 persist them.
    day: dateSchema,
    time: timeSchema,
    deadline: dateSchema,
    estimate: z
      .object({ unit: z.literal('workdays'), value: z.number().int().min(1) })
      .strict()
      .optional(),
    subtasks: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().trim().min(1),
          completed: z.boolean(),
        })
        .strict(),
    ),
    comments: z.array(
      z.object({ id: z.string().min(1), text: z.string() }).strict(),
    ),
    attachments: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string(),
          mediaType: z.string(),
          sizeBytes: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    rolledOverFrom: dateSchema,
    addedOrder: z.number().int(),
  })
  .strict();
const columnSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string(),
    state: z.enum(['todo', 'doing', 'waiting', 'done']),
    builtIn: z.boolean(),
  })
  .strict();
const nonEmptyWorkdays = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .refine((days) => new Set(days).size === days.length);
const themeChoice = z.enum(['system', 'light', 'dark']);
const aiModeChoice = z.enum(['auto', 'confirm']);
const settingValueSchemas: Readonly<Record<string, z.ZodType>> = {
  workdays: nonEmptyWorkdays,
  theme: themeChoice,
  aiMode: aiModeChoice,
};
const genericSettingValueSchemas: Readonly<Record<string, z.ZodType>> = {
  workdays: nonEmptyWorkdays,
  aiMode: aiModeChoice,
};
export const settingFields = {
  key: z.string().min(1),
  value: z.unknown(),
};

function validateSetting(
  setting: { key: string; value: unknown },
  context: z.RefinementCtx,
  schemas: Readonly<Record<string, z.ZodType>>,
): void {
  const valueSchema = Object.hasOwn(schemas, setting.key)
    ? schemas[setting.key]
    : undefined;
  if (!valueSchema?.safeParse(setting.value).success) {
    context.addIssue({ code: 'custom', message: 'Invalid setting value' });
  }
}

export function validateSettingValue(
  setting: { key: string; value: unknown },
  context: z.RefinementCtx,
): void {
  validateSetting(setting, context, settingValueSchemas);
}

export function validateGenericSettingValue(
  setting: { key: string; value: unknown },
  context: z.RefinementCtx,
): void {
  validateSetting(setting, context, genericSettingValueSchemas);
}
const ipcTaskSchema = taskSchema
  .extend({ attachments: z.array(z.never()) })
  .strict();

const taskCreateSchema = z
  .object({
    kind: z.literal('task.create'),
    task: taskSchema.extend({ attachments: z.array(z.never()) }),
  })
  .strict();
const ipcTaskCreateSchema = z
  .object({ kind: z.literal('task.create'), task: ipcTaskSchema })
  .strict();
const taskUpdateSchema = z
  .object({
    kind: z.literal('task.update'),
    id: z.string().min(1),
    changes: z
      .object({
        title: z.string().trim().min(1).optional(),
        description: z.string().nullable().optional(),
        day: clearableDateSchema,
        time: timeValueSchema.nullable().optional(),
        deadline: clearableDateSchema,
        estimate: taskSchema.shape.estimate.nullable(),
        rolledOverFrom: clearableDateSchema,
        addedOrder: z.number().int().optional(),
        status: statusSchema.optional(),
      })
      .strict(),
  })
  .strict();
const taskMoveSchema = z
  .object({
    kind: z.literal('task.move'),
    id: z.string().min(1),
    columnId: z.string().min(1),
    status: statusSchema.optional(),
  })
  .strict();
const subtaskAddSchema = z
  .object({
    kind: z.literal('subtask.add'),
    taskId: z.string().min(1),
    subtask: taskSchema.shape.subtasks.element,
  })
  .strict();
const subtaskCompleteSchema = z
  .object({
    kind: z.literal('subtask.complete'),
    taskId: z.string().min(1),
    subtaskId: z.string().min(1),
    completed: z.boolean(),
  })
  .strict();
const commentAddSchema = z
  .object({
    kind: z.literal('comment.add'),
    taskId: z.string().min(1),
    // The creation time is stamped by the main-process clock, never accepted.
    comment: z
      .object({ id: z.string().min(1), text: z.string().min(1).max(5000) })
      .strict(),
  })
  .strict();
const columnCreateSchema = z
  .object({ kind: z.literal('column.create'), column: columnSchema })
  .strict();
const columnRenameSchema = z
  .object({
    kind: z.literal('column.rename'),
    id: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string(),
  })
  .strict();
const columnDeleteSchema = z
  .object({
    kind: z.literal('column.delete'),
    id: z.string().min(1),
    targetColumnId: z.string().min(1).optional(),
    waiting: z
      .object({
        reason: z.string().trim().min(1),
        until: dateValueSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const settingCommandFields = z
  .object({ ...settingFields, kind: z.literal('setting.set') })
  .strict();
const settingCommandSchema =
  settingCommandFields.superRefine(validateSettingValue);
const genericSettingCommandSchema = settingCommandFields.superRefine(
  validateGenericSettingValue,
);

export const commandSchema = z.discriminatedUnion('kind', [
  taskCreateSchema,
  taskUpdateSchema,
  taskMoveSchema,
  subtaskAddSchema,
  subtaskCompleteSchema,
  subtaskRenameSchema,
  subtaskRemoveSchema,
  subtaskMoveSchema,
  commentAddSchema,
  attachmentAddSchema,
  attachmentRemoveSchema,
  columnCreateSchema,
  columnRenameSchema,
  columnDeleteSchema,
  seriesCreateSchema,
  seriesUpdateSchema,
  seriesStopSchema,
  seriesRecordOutcomeSchema,
  settingCommandSchema,
  taskSetAiRankSchema,
  taskClassifySchema,
  taskTypeCreateSchema,
  taskTypeRenameSchema,
  taskTypeDeleteSchema,
  disciplineCreateSchema,
  disciplineRenameSchema,
  disciplineDeleteSchema,
  ruleImportSchema,
  ruleActivateSchema,
  ruleDeactivateSchema,
  ruleBindSchema,
]);

export const ipcCommandSchema = z.discriminatedUnion('kind', [
  ipcTaskCreateSchema,
  taskUpdateSchema,
  taskMoveSchema,
  subtaskAddSchema,
  subtaskCompleteSchema,
  subtaskRenameSchema,
  subtaskRemoveSchema,
  subtaskMoveSchema,
  commentAddSchema,
  columnCreateSchema,
  columnRenameSchema,
  columnDeleteSchema,
  seriesCreateSchema,
  seriesUpdateSchema,
  seriesStopSchema,
  seriesRecordOutcomeSchema,
  genericSettingCommandSchema,
  taskTypeCreateSchema,
  taskTypeRenameSchema,
  taskTypeDeleteSchema,
  disciplineCreateSchema,
  disciplineRenameSchema,
  disciplineDeleteSchema,
]);
