import { z } from 'zod';

export const scheduleEvent = z
  .object({
    source_key: z.string(),
    source: z.enum(['modeus', 'ics', 'manual']),
    title: z.string(),
    start_utc: z.string().nullable(),
    end_utc: z.string().nullable(),
    time_zone: z.string(),
    place: z.string().nullable(),
    cancelled: z.number().int().min(0).max(1),
    weekdays_json: z.string().nullable(),
    local_start_time: z.string().nullable(),
    local_end_time: z.string().nullable(),
    recurrence_start: z.string().nullable(),
    recurrence_end: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export const scheduleSnapshot = z
  .object({
    source: z.enum(['modeus', 'ics', 'manual']),
    fetched_at: z.string(),
    status: z.enum(['ok', 'error']),
    last_error: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
