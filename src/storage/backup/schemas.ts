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
    type_id: z.string().min(1).nullable().default(null),
    discipline_id: z.string().min(1).nullable().default(null),
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
    created_at: z.string(),
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
const catalogItem = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    color: z.enum(['study', 'health', 'personal', 'none']).nullable(),
  })
  .strict();

const ruleDocument = z
  .object({
    id: z.string().min(1),
    document_json: z.string(),
    active_document_json: z.string().nullable().default(null),
    active_version: z.number().int().min(1).nullable().default(null),
    status: z.enum(['draft', 'active']),
    version: z.number().int().min(1),
    validation_errors_json: z.string(),
    updated_at: z.string(),
  })
  .strict();

const ruleVersion = z
  .object({
    rule_id: z.string().min(1),
    version: z.number().int().min(1),
    document_json: z.string(),
    accepted_at: z.string(),
  })
  .strict();
const emptyRules = z.array(ruleDocument).default([]);

const backupSeries = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    description: z.string().nullable(),
    weekdays_json: z.string().refine(isValidWeekdaysJson),
    time: plainTime.nullable(),
    starts_on: plainDate,
    ends_on: plainDate.nullable(),
    version: z.number().int().min(1),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict()
  .superRefine((series, context) => {
    if (
      series.ends_on !== null &&
      Temporal.PlainDate.compare(
        Temporal.PlainDate.from(series.ends_on),
        Temporal.PlainDate.from(series.starts_on),
      ) < 0
    )
      context.addIssue({
        code: 'custom',
        path: ['ends_on'],
        message: 'Дата окончания серии раньше даты начала',
      });
  });
const backupOutcome = z
  .object({
    series_id: z.string().min(1),
    date: plainDate,
    kind: z.enum(['done', 'skipped', 'dismissed', 'rescheduled']),
    new_date: plainDate.nullable(),
    new_time: plainTime.nullable(),
    version: z.number().int().min(1),
    recorded_at: z.string(),
  })
  .strict()
  .superRefine((outcome, context) => {
    const hasReschedule =
      outcome.new_date !== null && outcome.new_time !== null;
    if ((outcome.kind === 'rescheduled') !== hasReschedule)
      context.addIssue({
        code: 'custom',
        message: 'Некорректный перенос повтора',
      });
  });

export const backupDataSchema = z
  .object({
    columns: z.array(column),
    tasks: z.array(task),
    subtasks: z.array(subtask),
    comments: z.array(comment),
    attachments: z.array(attachment),
    settings: z.array(setting),
    task_types: z.array(catalogItem).default([]),
    disciplines: z.array(catalogItem).default([]),
    rules: emptyRules,
    rule_versions: z.array(ruleVersion).default([]),
    series: z.array(backupSeries).optional(),
    outcomes: z.array(backupOutcome).optional(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((data, context) => {
    const seriesIds = new Set((data.series ?? []).map(({ id }) => id));
    const outcomeKeys = new Set<string>();
    for (const [index, outcome] of (data.outcomes ?? []).entries()) {
      if (!seriesIds.has(outcome.series_id))
        context.addIssue({
          code: 'custom',
          path: ['outcomes', index, 'series_id'],
          message: 'Исход ссылается на отсутствующую серию',
        });
      const key = `${outcome.series_id}:${outcome.date}`;
      if (outcomeKeys.has(key))
        context.addIssue({
          code: 'custom',
          path: ['outcomes', index],
          message: 'Повторный исход для одной даты серии',
        });
      outcomeKeys.add(key);
    }
  });

function isValidWeekdaysJson(value: string): boolean {
  try {
    const days: unknown = JSON.parse(value);
    return (
      Array.isArray(days) &&
      days.length > 0 &&
      days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7) &&
      new Set(days).size === days.length
    );
  } catch {
    return false;
  }
}

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
