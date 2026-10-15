import { z } from 'zod';
import { Temporal } from 'temporal-polyfill';

const plainDate = z.string().refine((value) => {
  try {
    Temporal.PlainDate.from(value);
    return true;
  } catch {
    return false;
  }
});
const plainTime = z.string().refine((value) => {
  try {
    Temporal.PlainTime.from(value);
    return true;
  } catch {
    return false;
  }
});

const instant = z.string().refine((value) => {
  try {
    Temporal.Instant.from(value);
    return true;
  } catch {
    return false;
  }
});

const column = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    state: z.enum(['todo', 'doing', 'waiting', 'done']),
    built_in: z.union([z.literal(0), z.literal(1)]),
    position: z.number().int(),
    version: z.number().int().min(1),
  })
  .strict();

const task = z
  .object({
    id: z.string().min(1),
    title: z.string().refine((value) => value.trim().length > 0),
    description: z.string().nullable(),
    column_id: z.string().min(1),
    day: plainDate.nullable(),
    time: plainTime.nullable(),
    deadline: plainDate.nullable(),
    estimate_unit: z.literal('workdays').nullable(),
    estimate_value: z.number().int().min(1).nullable(),
    status_kind: z.enum(['todo', 'doing', 'waiting', 'done']),
    waiting_reason: z.string().nullable(),
    waiting_until: plainDate.nullable(),
    rolled_over_from: plainDate.nullable(),
    position: z.number().int(),
    ai_rank: z.number().int().min(0).nullable().default(null),
    version: z.number().int().min(1),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict()
  .superRefine((value, context) => {
    const isWaiting = value.status_kind === 'waiting';
    if (
      isWaiting &&
      (value.waiting_reason === null ||
        value.waiting_reason.trim().length === 0)
    )
      context.addIssue({
        code: 'custom',
        message: 'Некорректная причина ожидания',
      });
    if (
      !isWaiting &&
      (value.waiting_reason !== null || value.waiting_until !== null)
    )
      context.addIssue({
        code: 'custom',
        message: 'Некорректный срок ожидания',
      });
    if ((value.estimate_unit === null) !== (value.estimate_value === null))
      context.addIssue({
        code: 'custom',
        message: 'Некорректная оценка задачи',
      });
  });

const subtask = z
  .object({
    id: z.string().min(1),
    task_id: z.string().min(1),
    title: z.string().refine((value) => value.trim().length > 0),
    completed: z.union([z.literal(0), z.literal(1)]),
    position: z.number().int(),
  })
  .strict();

const comment = z
  .object({
    id: z.string().min(1),
    task_id: z.string().min(1),
    text: z.string(),
    // Legacy packages exported before the field carry no key: read as null.
    created_at: instant.nullable().default(null),
    position: z.number().int(),
  })
  .strict();

const attachment = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/),
    task_id: z.string().min(1),
    name: z.string().min(1),
    media_type: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    position: z.number().int(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    created_at: z.string(),
  })
  .strict();

const setting = z
  .object({
    key: z.string().min(1),
    value_json: z.string().refine((value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }),
    version: z.number().int().min(1),
  })
  .strict();

export const backupDataSchema = z
  .object({
    columns: z.array(column),
    tasks: z.array(task),
    subtasks: z.array(subtask),
    comments: z.array(comment),
    attachments: z.array(attachment),
    settings: z.array(setting),
    revision: z.number().int().nonnegative(),
  })
  .strict();

export const manifestSchema = z
  .object({
    formatVersion: z.number().int().positive(),
    schemaVersion: z.number().int().positive(),
    appVersion: z.string(),
    exportedAt: z.string(),
    revision: z.number().int().nonnegative(),
    historyIncluded: z.literal(false),
    historyNote: z.string(),
    files: z
      .array(
        z
          .object({
            path: z.string(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            sizeBytes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(10_000),
  })
  .strict();

export type BackupData = z.infer<typeof backupDataSchema>;
export type BackupManifest = z.infer<typeof manifestSchema>;
