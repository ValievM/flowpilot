import { z } from 'zod';

const catalogItem = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    color: z.enum(['study', 'health', 'personal', 'none']).optional(),
  })
  .strict();

export const taskClassifySchema = z
  .object({
    kind: z.literal('task.classify'),
    taskId: z.string().min(1),
    typeId: z.string().min(1).nullable().optional(),
    disciplineId: z.string().min(1).nullable().optional(),
  })
  .strict();
export const taskTypeCreateSchema = z
  .object({ kind: z.literal('taskType.create'), taskType: catalogItem })
  .strict();
export const taskTypeRenameSchema = z
  .object({
    kind: z.literal('taskType.rename'),
    id: z.string().min(1),
    name: z.string().trim().min(1),
    color: z.enum(['study', 'health', 'personal', 'none']).optional(),
  })
  .strict();
export const taskTypeDeleteSchema = z
  .object({
    kind: z.literal('taskType.delete'),
    id: z.string().min(1),
    targetId: z.string().min(1).optional(),
  })
  .strict();
export const disciplineCreateSchema = z
  .object({ kind: z.literal('discipline.create'), discipline: catalogItem })
  .strict();
export const disciplineRenameSchema = z
  .object({
    kind: z.literal('discipline.rename'),
    id: z.string().min(1),
    name: z.string().trim().min(1),
    color: z.enum(['study', 'health', 'personal', 'none']).optional(),
  })
  .strict();
export const disciplineDeleteSchema = z
  .object({
    kind: z.literal('discipline.delete'),
    id: z.string().min(1),
    targetId: z.string().min(1).optional(),
  })
  .strict();
export const ruleImportSchema = z
  .object({ kind: z.literal('rule.import'), documentJson: z.string() })
  .strict();
export const ruleActivateSchema = z
  .object({ kind: z.literal('rule.activate'), ruleId: z.string().min(1) })
  .strict();
export const ruleDeactivateSchema = z
  .object({ kind: z.literal('rule.deactivate'), ruleId: z.string().min(1) })
  .strict();
export const ruleBindSchema = z
  .object({
    kind: z.literal('rule.bind'),
    ruleId: z.string().min(1),
    scope: z
      .object({
        task_type_ids: z.array(z.string().min(1)),
        discipline_ids: z.array(z.string().min(1)).optional(),
      })
      .strict(),
  })
  .strict();
export const attachmentAddSchema = z
  .object({
    kind: z.literal('attachment.add'),
    taskId: z.string().min(1),
    sourcePath: z.string().min(1),
  })
  .strict();
export const attachmentRemoveSchema = z
  .object({
    kind: z.literal('attachment.remove'),
    attachmentId: z.string().min(1),
  })
  .strict();
export const taskSetAiRankSchema = z
  .object({
    kind: z.literal('task.setAiRank'),
    taskId: z.string().min(1),
    rank: z.number().int().min(0),
  })
  .strict();
export const subtaskRenameSchema = z
  .object({
    kind: z.literal('subtask.rename'),
    taskId: z.string().min(1),
    subtaskId: z.string().min(1),
    // Mirrors SUBTASK_TITLE_MAX_LENGTH in src/domain/subtasks.ts.
    title: z.string().trim().min(1).max(200),
  })
  .strict();
export const subtaskRemoveSchema = z
  .object({
    kind: z.literal('subtask.remove'),
    taskId: z.string().min(1),
    subtaskId: z.string().min(1),
  })
  .strict();
export const subtaskMoveSchema = z
  .object({
    kind: z.literal('subtask.move'),
    taskId: z.string().min(1),
    subtaskId: z.string().min(1),
    position: z.number().int().min(0),
  })
  .strict();

/** What the interface itself may do with the catalog: classify, create, rename, delete. */
export const catalogCommandSchemas = [
  taskClassifySchema,
  taskTypeCreateSchema,
  taskTypeRenameSchema,
  taskTypeDeleteSchema,
  disciplineCreateSchema,
  disciplineRenameSchema,
  disciplineDeleteSchema,
] as const;
