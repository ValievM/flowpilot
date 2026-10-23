import { z } from 'zod';
import {
  instant,
  scheduleManualCommandSchemas,
} from '../shared/schedule-command-schema';

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
  ...scheduleManualCommandSchemas,
]);
