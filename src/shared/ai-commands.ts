import { Temporal } from 'temporal-polyfill';
import type { Task, TaskComment, TaskStatus, Subtask } from '../domain';
import { z } from 'zod';
import { commandSchema } from './command-schema';

export type AiTaskChanges = Partial<
  Pick<Task, 'title' | 'description' | 'day' | 'time' | 'deadline' | 'estimate'>
> & {
  readonly description?: string | null;
  readonly day?: Task['day'] | null;
  readonly time?: Task['time'] | null;
  readonly deadline?: Task['deadline'] | null;
  readonly estimate?: Task['estimate'] | null;
};

export interface AiTaskCreation {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly day?: NonNullable<Task['day']>;
  readonly time?: NonNullable<Task['time']>;
  readonly deadline?: NonNullable<Task['deadline']>;
  readonly estimate?: NonNullable<Task['estimate']>;
  readonly columnId: string;
  readonly typeId?: string;
  readonly disciplineId?: string;
  readonly subtasks: readonly Subtask[];
  readonly comment?: TaskComment;
}

const dateValueSchema = z.union([
  z.iso.date().transform((value) => Temporal.PlainDate.from(value)),
  z.custom<Temporal.PlainDate>((value) => value instanceof Temporal.PlainDate),
]);
const timeValueSchema = z.union([
  z.iso.time().transform((value) => Temporal.PlainTime.from(value)),
  z.custom<Temporal.PlainTime>((value) => value instanceof Temporal.PlainTime),
]);
const aiTaskCreationSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    description: z.string().optional(),
    day: dateValueSchema.optional(),
    time: timeValueSchema.optional(),
    deadline: dateValueSchema.optional(),
    estimate: z
      .object({ unit: z.literal('workdays'), value: z.number().int().min(1) })
      .strict()
      .optional(),
    columnId: z.string().min(1),
    typeId: z.string().min(1).optional(),
    disciplineId: z.string().min(1).optional(),
    subtasks: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().trim().min(1),
          completed: z.boolean(),
        })
        .strict(),
    ),
    comment: z
      .object({ id: z.string().min(1), text: z.string() })
      .strict()
      .optional(),
  })
  .strict();
const aiTaskChangesSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    day: dateValueSchema.nullable().optional(),
    time: timeValueSchema.nullable().optional(),
    deadline: dateValueSchema.nullable().optional(),
    estimate: z
      .object({ unit: z.literal('workdays'), value: z.number().int().min(1) })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
const allowedStorageKinds = new Set([
  'task.create',
  'task.update',
  'task.move',
  'subtask.add',
  'comment.add',
]);

export type AiBaseCommand =
  | { readonly kind: 'task.create'; readonly task: AiTaskCreation }
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

const aiTaskCreateCommandSchema = z
  .object({ kind: z.literal('task.create'), task: aiTaskCreationSchema })
  .strict();
const aiTaskUpdateCommandSchema = z
  .object({
    kind: z.literal('task.update'),
    id: z.string().min(1),
    changes: aiTaskChangesSchema,
  })
  .strict();
const baseCommandSchema = z.custom<AiBaseCommand>((value) => {
  if (typeof value !== 'object' || value === null || !('kind' in value))
    return false;
  if (value.kind === 'task.create')
    return aiTaskCreateCommandSchema.safeParse(value).success;
  if (value.kind === 'task.update')
    return aiTaskUpdateCommandSchema.safeParse(value).success;
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
export type AiPlannedCommand =
  | Exclude<AiBaseCommand, { kind: 'task.create' }>
  | { readonly kind: 'task.create'; readonly task: Task }
  | Extract<
      AiCommand,
      {
        kind:
          'task.classify' | 'rule.import' | 'rule.activate' | 'task.setAiRank';
      }
    >;

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
