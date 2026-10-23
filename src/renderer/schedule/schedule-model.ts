import { Temporal } from 'temporal-polyfill';
import type { FixedEvent } from '../../domain/schedule/fixed-events';
import {
  eventsOn,
  nextEvent,
  overlappingEvents,
  type ScheduleSnapshot,
} from '../../domain/schedule/fixed-events';
import type {
  ManualScheduleEvent,
  ScheduleEvent,
  ScheduleSourceSnapshot,
} from '../../shared/schedule-contracts';

/** A snapshot older than this no longer proves the person is free. */
const MAX_AGE = Temporal.Duration.from({ hours: 24 * 7 });
const MANUAL_WINDOW_DAYS = 60;

export interface SourceView {
  readonly source: ScheduleSourceSnapshot['source'];
  readonly fetchedAt: Temporal.ZonedDateTime;
  readonly status: 'ok' | 'error';
  readonly lastError: string | null;
  readonly events: readonly FixedEvent[];
}

export interface SchedulePlan {
  readonly hasData: boolean;
  readonly sources: readonly SourceView[];
  readonly errors: readonly SourceView[];
  readonly today: readonly FixedEvent[];
  readonly next: readonly FixedEvent[];
  readonly nextClass: FixedEvent | undefined;
  readonly free: boolean;
}

function isManual(
  event: ScheduleEvent | ManualScheduleEvent,
): event is ManualScheduleEvent {
  return 'weekdays' in event;
}

function importedEvent(event: ScheduleEvent): FixedEvent {
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

function manualOccurrences(
  event: ManualScheduleEvent,
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

function sourceView(
  snapshot: ScheduleSourceSnapshot,
  zone: string,
  today: Temporal.PlainDate,
): SourceView {
  const events = snapshot.events.flatMap((event) =>
    isManual(event)
      ? manualOccurrences(
          event,
          today.subtract({ days: 1 }),
          today.add({ days: MANUAL_WINDOW_DAYS }),
        )
      : [importedEvent(event)],
  );
  return {
    source: snapshot.source,
    fetchedAt: Temporal.Instant.from(snapshot.fetchedAt).toZonedDateTimeISO(
      zone,
    ),
    status: snapshot.status,
    lastError: snapshot.lastError,
    events,
  };
}

function merged(
  sources: readonly SourceView[],
  now: Temporal.ZonedDateTime,
): ScheduleSnapshot {
  return {
    events: sources.flatMap(({ events }) => events),
    fetchedAt: now,
    source: 'ics',
    status: 'ok',
  };
}

function isFree(
  sources: readonly SourceView[],
  now: Temporal.ZonedDateTime,
  todayEvents: readonly FixedEvent[],
): boolean {
  const usable = sources.filter(
    ({ status, fetchedAt }) =>
      status === 'ok' &&
      Temporal.Duration.compare(fetchedAt.until(now), MAX_AGE, {
        relativeTo: now,
      }) <= 0,
  );
  const known = sources.flatMap(({ events }) => events);
  if (usable.length === 0 || known.length === 0) return false;
  if (sources.some(({ status }) => status === 'error')) return false;
  return !todayEvents.some(
    (event) => Temporal.ZonedDateTime.compare(event.end, now) > 0,
  );
}

/** Everything the screens need to know about fixed time, from the stored snapshots. */
export function buildSchedulePlan(
  snapshots: readonly ScheduleSourceSnapshot[],
  now: Temporal.ZonedDateTime,
): SchedulePlan {
  const today = now.toPlainDate();
  const sources = snapshots.map((snapshot) =>
    sourceView(snapshot, now.timeZoneId, today),
  );
  const all = merged(sources, now);
  const todayEvents = eventsOn(all, today)
    .filter(({ cancelled }) => !cancelled)
    .sort((left, right) =>
      Temporal.ZonedDateTime.compare(left.start, right.start),
    );
  return {
    hasData: snapshots.length > 0,
    sources,
    errors: sources.filter(({ status }) => status === 'error'),
    today: todayEvents,
    next: todayEvents.filter(
      ({ end }) => Temporal.ZonedDateTime.compare(end, now) > 0,
    ),
    nextClass: nextEvent(all, now),
    free: isFree(sources, now, todayEvents),
  };
}

/** Classes that cover a task's time. Nothing is moved: the person decides. */
export function conflictingEvents(
  plan: SchedulePlan,
  day: Temporal.PlainDate,
  time: Temporal.PlainTime,
  zone: string,
): FixedEvent[] {
  const at = day.toZonedDateTime({ timeZone: zone, plainTime: time });
  return overlappingEvents(
    merged(plan.sources, at),
    at,
    at.add({ milliseconds: 1 }),
  );
}
