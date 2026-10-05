import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';

const dateValueSchema = z.union([
  z.iso.date(),
  z.custom<Temporal.PlainDate>((value) => value instanceof Temporal.PlainDate),
]);
const timeValueSchema = z.union([
  z.iso.time(),
  z.custom<Temporal.PlainTime>((value) => value instanceof Temporal.PlainTime),
]);

const statusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('todo') }),
  z.object({ kind: z.literal('doing') }),
  z.object({ kind: z.literal('done') }),
  z.object({
    kind: z.literal('waiting'),
    reason: z.string().trim().min(1),
    until: dateValueSchema.optional(),
  }),
]);
const dateSchema = dateValueSchema.optional();
const timeSchema = timeValueSchema.optional();
const clearableDateSchema = dateValueSchema.nullable().optional();
const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  status: statusSchema,
  columnId: z.string().min(1),
  day: dateSchema,
  time: timeSchema,
  deadline: dateSchema,
  estimate: z
    .object({ unit: z.literal('workdays'), value: z.number().int().min(1) })
    .optional(),
  subtasks: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().trim().min(1),
      completed: z.boolean(),
    }),
  ),
  comments: z.array(z.object({ id: z.string().min(1), text: z.string() })),
  attachments: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      mediaType: z.string(),
      sizeBytes: z.number().int().nonnegative(),
    }),
  ),
  rolledOverFrom: dateSchema,
  addedOrder: z.number().int(),
});
const columnSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  state: z.enum(['todo', 'doing', 'waiting', 'done']),
  builtIn: z.boolean(),
});
const nonEmptyWorkdays = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length);

export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task.create'), task: taskSchema }),
  z.object({
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
  }),
  z.object({
    kind: z.literal('task.move'),
    id: z.string().min(1),
    columnId: z.string().min(1),
    status: statusSchema.optional(),
  }),
  z.object({
    kind: z.literal('subtask.add'),
    taskId: z.string().min(1),
    subtask: taskSchema.shape.subtasks.element,
  }),
  z.object({
    kind: z.literal('subtask.complete'),
    taskId: z.string().min(1),
    subtaskId: z.string().min(1),
    completed: z.boolean(),
  }),
  z.object({
    kind: z.literal('comment.add'),
    taskId: z.string().min(1),
    comment: z.object({ id: z.string().min(1), text: z.string() }),
  }),
  z.object({
    kind: z.literal('attachment.add'),
    taskId: z.string().min(1),
    sourcePath: z.string().min(1),
  }),
  z.object({
    kind: z.literal('attachment.remove'),
    attachmentId: z.string().min(1),
  }),
  z.object({ kind: z.literal('column.create'), column: columnSchema }),
  z.object({
    kind: z.literal('column.rename'),
    id: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string(),
  }),
  z.object({
    kind: z.literal('column.delete'),
    id: z.string().min(1),
    targetColumnId: z.string().min(1).optional(),
  }),
  z
    .object({
      kind: z.literal('setting.set'),
      key: z.string().min(1),
      value: z.unknown(),
    })
    .superRefine((command, context) => {
      if (
        command.key === 'workdays' &&
        !nonEmptyWorkdays.safeParse(command.value).success
      )
        context.addIssue({
          code: 'custom',
          message: 'workdays must contain unique weekdays from 1 to 7',
        });
    }),
]);
