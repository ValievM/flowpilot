import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';

const dateValueSchema = z.union([
  z.iso.date().transform((value) => Temporal.PlainDate.from(value)),
  z.custom<Temporal.PlainDate>((value) => value instanceof Temporal.PlainDate),
]);
const timeValueSchema = z.union([
  z.iso.time().transform((value) => Temporal.PlainTime.from(value)),
  z.custom<Temporal.PlainTime>((value) => value instanceof Temporal.PlainTime),
]);
const weekdaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .refine((days) => new Set(days).size === days.length);
const seriesSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    description: z.string().optional(),
    weekdays: weekdaysSchema,
    time: timeValueSchema.optional(),
    startsOn: dateValueSchema,
    endsOn: dateValueSchema.optional(),
  })
  .strict();
const changesSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    weekdays: weekdaysSchema.optional(),
    time: timeValueSchema.nullable().optional(),
    startsOn: dateValueSchema.optional(),
    endsOn: dateValueSchema.nullable().optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0);
const dateOutcomeSchema = z
  .object({
    kind: z.enum(['done', 'skipped', 'dismissed']),
    date: dateValueSchema,
  })
  .strict();
const rescheduledOutcomeSchema = z
  .object({
    kind: z.literal('rescheduled'),
    date: dateValueSchema,
    newDate: dateValueSchema,
    newTime: timeValueSchema,
  })
  .strict();
const outcomeSchema = z.discriminatedUnion('kind', [
  dateOutcomeSchema,
  rescheduledOutcomeSchema,
]);

export const seriesCreateSchema = z
  .object({ kind: z.literal('series.create'), series: seriesSchema })
  .strict()
  .refine(
    ({ series }) =>
      !series.endsOn ||
      Temporal.PlainDate.compare(series.endsOn, series.startsOn) >= 0,
  );
export const seriesUpdateSchema = z
  .object({
    kind: z.literal('series.update'),
    id: z.string().min(1),
    changes: changesSchema,
  })
  .strict();
export const seriesStopSchema = z
  .object({
    kind: z.literal('series.stop'),
    id: z.string().min(1),
    endDate: dateValueSchema,
  })
  .strict();
export const seriesRecordOutcomeSchema = z
  .object({
    kind: z.literal('series.recordOutcome'),
    seriesId: z.string().min(1),
    outcome: outcomeSchema,
  })
  .strict();
