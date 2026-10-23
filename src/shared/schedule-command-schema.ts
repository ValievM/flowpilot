import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';

function isTemporal(parse: () => unknown): boolean {
  try {
    parse();
    return true;
  } catch {
    return false;
  }
}

export const instant = z
  .string()
  .refine((value) => isTemporal(() => Temporal.Instant.from(value)));
const date = z
  .string()
  .refine((value) => isTemporal(() => Temporal.PlainDate.from(value)));
const time = z
  .string()
  .refine((value) => isTemporal(() => Temporal.PlainTime.from(value)));

export const manualEvent = z
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

/** The only schedule commands the interface may send: imports go through a confirmed preview. */
export const scheduleManualCommandSchemas = [
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
] as const;
