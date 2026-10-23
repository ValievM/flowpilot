import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';

const instant = z
  .string()
  .refine((value) => isTemporal(() => Temporal.Instant.from(value)));
const date = z
  .string()
  .refine((value) => isTemporal(() => Temporal.PlainDate.from(value)));
const time = z
  .string()
  .refine((value) => isTemporal(() => Temporal.PlainTime.from(value)));
const importedEvent = z
  .object({
    key: z.string().min(1),
    source: z.enum(['modeus', 'ics']),
    title: z.string().min(1),
    startUtc: instant,
    endUtc: instant,
    timeZone: z.string().min(1),
    place: z.string().optional(),
    cancelled: z.boolean().optional(),
  })
  .strict();
const manualEvent = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    timeZone: z.string().min(1),
    place: z.string().optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    startTime: time,
    endTime: time,
    fromDate: date,
    throughDate: date,
  })
  .strict();

export const scheduleCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('schedule.import'),
      source: z.enum(['modeus', 'ics']),
      events: z.array(importedEvent),
      fetchedAt: instant,
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule.error'),
      source: z.enum(['modeus', 'ics']),
      message: z.string().min(1),
      at: instant,
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule.manual.add'),
      event: manualEvent,
      at: instant,
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule.manual.update'),
      id: z.string().min(1),
      event: manualEvent,
      at: instant,
    })
    .strict(),
  z
    .object({
      kind: z.literal('schedule.manual.remove'),
      id: z.string().min(1),
      at: instant,
    })
    .strict(),
]);

function isTemporal(parse: () => unknown): boolean {
  try {
    parse();
    return true;
  } catch {
    return false;
  }
}
