import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';

export type EventSource = 'modeus' | 'ics' | 'manual';

export interface FixedEvent {
  key: string;
  source: EventSource;
  title: string;
  start: TemporalTypes.ZonedDateTime;
  end: TemporalTypes.ZonedDateTime;
  place?: string;
  kind?: string;
  cancelled?: boolean;
}

export interface ScheduleSnapshot {
  events: readonly FixedEvent[];
  fetchedAt: TemporalTypes.ZonedDateTime;
  source: EventSource;
  status: 'ok' | 'error';
  lastError?: string;
}

export type ScheduleAvailability = 'busy' | 'free' | 'unknown';

export function ageOf(
  snapshot: ScheduleSnapshot,
  now: TemporalTypes.ZonedDateTime,
): TemporalTypes.Duration {
  return now.since(snapshot.fetchedAt);
}

export function mergeSnapshot(
  previous: ScheduleSnapshot | undefined,
  incoming: ScheduleSnapshot,
): ScheduleSnapshot {
  if (incoming.status === 'error') {
    return {
      ...incoming,
      events: previous?.events ?? incoming.events,
      fetchedAt: previous?.fetchedAt ?? incoming.fetchedAt,
    };
  }

  const incomingKeys = new Set(incoming.events.map(({ key }) => key));
  const pastEvents = (previous?.events ?? []).filter(
    ({ key, start }) =>
      !incomingKeys.has(key) &&
      Temporal.ZonedDateTime.compare(start, incoming.fetchedAt) <= 0,
  );
  return { ...incoming, events: [...incoming.events, ...pastEvents] };
}

export function eventsOn(
  snapshot: ScheduleSnapshot,
  date: TemporalTypes.PlainDate,
): FixedEvent[] {
  return snapshot.events.filter((event) => {
    const dayStart = date
      .toZonedDateTime({
        timeZone: event.start.timeZoneId,
        plainTime: Temporal.PlainTime.from('00:00'),
      })
      .startOfDay();
    const dayEnd = dayStart.add({ days: 1 });
    return (
      Temporal.ZonedDateTime.compare(event.start, dayEnd) < 0 &&
      Temporal.ZonedDateTime.compare(event.end, dayStart) > 0
    );
  });
}

export function nextEvent(
  snapshot: ScheduleSnapshot,
  now: TemporalTypes.ZonedDateTime,
): FixedEvent | undefined {
  let nearest: FixedEvent | undefined;
  for (const event of snapshot.events) {
    if (
      event.cancelled ||
      Temporal.ZonedDateTime.compare(event.start, now) < 0
    ) {
      continue;
    }
    if (
      !nearest ||
      Temporal.ZonedDateTime.compare(event.start, nearest.start) < 0
    ) {
      nearest = event;
    }
  }
  return nearest;
}

export function overlappingEvents(
  snapshot: ScheduleSnapshot,
  taskStart: TemporalTypes.ZonedDateTime,
  taskEnd: TemporalTypes.ZonedDateTime,
): FixedEvent[] {
  return snapshot.events.filter(
    ({ cancelled, start, end }) =>
      !cancelled &&
      Temporal.ZonedDateTime.compare(start, taskEnd) < 0 &&
      Temporal.ZonedDateTime.compare(end, taskStart) > 0,
  );
}

export function availabilityOn(
  snapshot: ScheduleSnapshot | undefined,
  date: TemporalTypes.PlainDate,
  now: TemporalTypes.ZonedDateTime,
  maxAge: TemporalTypes.Duration,
): ScheduleAvailability {
  if (!snapshot || snapshot.status === 'error') return 'unknown';

  const age = ageOf(snapshot, now);
  if (age.sign < 0 || Temporal.Duration.compare(age, maxAge) > 0) {
    return 'unknown';
  }
  return eventsOn(snapshot, date).some(({ cancelled }) => !cancelled)
    ? 'busy'
    : 'free';
}
