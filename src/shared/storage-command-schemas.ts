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
