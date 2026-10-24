import { Temporal } from 'temporal-polyfill';
import type { FixedEvent } from './fixed-events';

/** Stored schedule rows as the interface and the reminders both see them. */
export interface StoredImportedEvent {
  readonly key: string;
  readonly source: 'modeus' | 'ics';
  readonly title: string;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly timeZone: string;
  readonly place?: string | undefined;
  readonly cancelled?: boolean | undefined;
}

export interface StoredManualEvent {
  readonly id: string;
  readonly title: string;
  readonly timeZone: string;
  readonly place?: string | undefined;
  readonly weekdays: readonly number[];
  readonly startTime: string;
  readonly endTime: string;
  readonly fromDate: string;
  readonly throughDate: string;
}

export type StoredEvent = StoredImportedEvent | StoredManualEvent;

export function isManualEvent(event: StoredEvent): event is StoredManualEvent {
  return 'weekdays' in event;
}

export function importedFixedEvent(event: StoredImportedEvent): FixedEvent {
  return {
    key: event.key,
    source: event.source,
    title: event.title,
    start: Temporal.Instant.from(event.startUtc).toZonedDateTimeISO(
      event.timeZone,
    ),
    end: Temporal.Instant.from(event.endUtc).toZonedDateTimeISO(event.timeZone),
    ...(event.place ? { place: event.place } : {}),
    ...(event.cancelled ? { cancelled: true } : {}),
  };
}

export function manualFixedEvents(
  event: StoredManualEvent,
  from: Temporal.PlainDate,
  to: Temporal.PlainDate,
): FixedEvent[] {
  const first = Temporal.PlainDate.from(event.fromDate);
  const last = Temporal.PlainDate.from(event.throughDate);
  const occurrences: FixedEvent[] = [];
  let day = Temporal.PlainDate.compare(from, first) > 0 ? from : first;
  const end = Temporal.PlainDate.compare(to, last) < 0 ? to : last;
  for (
    ;
    Temporal.PlainDate.compare(day, end) <= 0;
    day = day.add({ days: 1 })
  ) {
    if (!event.weekdays.includes(day.dayOfWeek)) continue;
    const at = (time: string) =>
      day.toZonedDateTime({
        timeZone: event.timeZone,
        plainTime: Temporal.PlainTime.from(time),
      });
    occurrences.push({
      key: `${event.id}:${day.toString()}`,
      source: 'manual',
      title: event.title,
      start: at(event.startTime),
      end: at(event.endTime),
      ...(event.place ? { place: event.place } : {}),
    });
  }
  return occurrences;
}
