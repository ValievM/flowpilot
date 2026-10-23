import { Temporal } from 'temporal-polyfill';
import type { ManualScheduleEvent, ScheduleEvent } from './types';

export type EventRow = {
  source_key: string;
  source: 'modeus' | 'ics' | 'manual';
  title: string;
  start_utc: string | null;
  end_utc: string | null;
  time_zone: string;
  place: string | null;
  cancelled: number;
  weekdays_json: string | null;
  local_start_time: string | null;
  local_end_time: string | null;
  recurrence_start: string | null;
  recurrence_end: string | null;
};

export function validateManual(event: ManualScheduleEvent): void {
  if (!event.id.trim() || !event.title.trim())
    throw new Error('Manual event needs an id and title');
  if (
    event.weekdays.length === 0 ||
    event.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  )
    throw new Error('Manual event weekdays are invalid');
  if (new Set(event.weekdays).size !== event.weekdays.length)
    throw new Error('Manual event weekdays must be unique');
  const start = Temporal.PlainTime.from(event.startTime);
  const end = Temporal.PlainTime.from(event.endTime);
  if (Temporal.PlainTime.compare(start, end) >= 0)
    throw new Error('Manual event end must follow start');
  const from = Temporal.PlainDate.from(event.fromDate);
  const through = Temporal.PlainDate.from(event.throughDate);
  if (Temporal.PlainDate.compare(from, through) > 0)
    throw new Error('Manual event date range is invalid');
  from.toPlainDateTime(start).toZonedDateTime(event.timeZone);
}

export function importedEvent(row: EventRow): ScheduleEvent {
  if (
    !row.start_utc ||
    !row.end_utc ||
    !row.source_key ||
    row.source === 'manual'
  )
    throw new Error('Invalid imported schedule row');
  return {
    key: row.source_key,
    source: row.source,
    title: row.title,
    startUtc: row.start_utc,
    endUtc: row.end_utc,
    timeZone: row.time_zone,
    ...(row.place === null ? {} : { place: row.place }),
    ...(row.cancelled === 0 ? {} : { cancelled: true }),
  };
}

export function manualEvent(row: EventRow): ManualScheduleEvent {
  if (
    !row.source_key.trim() ||
    row.weekdays_json === null ||
    row.local_start_time === null ||
    row.local_end_time === null ||
    row.recurrence_start === null ||
    row.recurrence_end === null
  )
    throw new Error('Invalid manual schedule row');
  return {
    id: row.source_key,
    title: row.title,
    timeZone: row.time_zone,
    ...(row.place === null ? {} : { place: row.place }),
    weekdays: JSON.parse(row.weekdays_json) as number[],
    startTime: row.local_start_time,
    endTime: row.local_end_time,
    fromDate: row.recurrence_start,
    throughDate: row.recurrence_end,
  };
}
