import type { Task, TaskComment, TaskStatus, Subtask } from '../domain';
import { z } from 'zod';
import { commandSchema } from './command-schema';

export type AiTaskChanges = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'day'
    | 'time'
    | 'deadline'
    | 'estimate'
    | 'rolledOverFrom'
    | 'addedOrder'
    | 'status'
  >
> & {
  readonly description?: string | null;
  readonly day?: Task['day'] | null;
  readonly time?: Task['time'] | null;
  readonly deadline?: Task['deadline'] | null;
  readonly estimate?: Task['estimate'] | null;
  readonly rolledOverFrom?: Task['rolledOverFrom'] | null;
};

const allowedStorageKinds = new Set([
  'task.create',
  'task.update',
  'task.move',
  'subtask.add',
  'comment.add',
]);

export type AiBaseCommand =
  | { readonly kind: 'task.create'; readonly task: Task }
  | {
      readonly kind: 'task.update';
      readonly id: string;
      readonly changes: AiTaskChanges;
    }
  | {
      readonly kind: 'task.move';
      readonly id: string;
      readonly columnId: string;
      readonly status?: TaskStatus;
    }
  | {
      readonly kind: 'subtask.add';
      readonly taskId: string;
      readonly subtask: Subtask;
    }
  | {
      readonly kind: 'comment.add';
      readonly taskId: string;
      readonly comment: TaskComment;
    };

const baseCommandSchema = z.custom<AiBaseCommand>((value) => {
  if (typeof value !== 'object' || value === null || !('kind' in value))
    return false;
  if (typeof value.kind !== 'string' || !allowedStorageKinds.has(value.kind))
    return false;
  return commandSchema.safeParse(value).success;
}, 'Invalid AI storage command');

const taskClassifySchema = z
  .object({
    kind: z.literal('task.classify'),
    taskId: z.string().min(1),
    typeId: z.string().min(1).nullable().optional(),
    disciplineId: z.string().min(1).nullable().optional(),
  })
  .strict();
const ruleImportSchema = z
  .object({
    kind: z.literal('rule.import'),
    documentJson: z.string().min(1),
  })
  .strict();
const ruleActivateSchema = z
  .object({
    kind: z.literal('rule.activate'),
    ruleId: z.string().min(1),
  })
  .strict();
const taskSetAiRankSchema = z
  .object({
    kind: z.literal('task.setAiRank'),
    taskId: z.string().min(1),
    rank: z.number().int().min(0),
  })
  .strict();
export const aiCommandSchema = z.union([
  baseCommandSchema,
  taskClassifySchema,
  ruleImportSchema,
  ruleActivateSchema,
  taskSetAiRankSchema,
]);

export type AiCommand = z.infer<typeof aiCommandSchema>;
export type AiPlannedCommand = AiBaseCommand | AiCommand;

export interface Proposal {
  readonly id: string;
  readonly baseRevision: number;
  readonly ruleVersions: Readonly<Record<string, string>>;
  readonly commands: readonly AiCommand[];
  readonly rationale: string;
  readonly unknowns: readonly string[];
  readonly createdAt: string;
}

export const proposalSchema = z
  .object({
    id: z.string().min(1),
    baseRevision: z.number().int().nonnegative(),
    ruleVersions: z.record(z.string(), z.string()),
    commands: z.array(z.unknown()),
    rationale: z.string(),
    unknowns: z.array(z.string().min(1)),
    createdAt: z.iso.datetime(),
  })
  .strict();

export interface AiCommandBatch {
  readonly commands: readonly AiPlannedCommand[];
  readonly source: 'ai';
}
