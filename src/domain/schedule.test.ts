import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  ageOf,
  availabilityOn,
  eventsOn,
  mergeSnapshot,
  nextEvent,
  overlappingEvents,
  type FixedEvent,
  type ScheduleSnapshot,
} from './index';

const date = Temporal.PlainDate.from('2026-11-01');
const now = Temporal.ZonedDateTime.from(
  '2026-11-01T08:00-05:00[America/New_York]',
);
const at = (value: string) => Temporal.ZonedDateTime.from(value);

function event(
  key: string,
  start: string,
  end: string,
  overrides: Partial<FixedEvent> = {},
): FixedEvent {
  return {
    key,
    source: 'modeus',
    title: key,
    start: at(start),
    end: at(end),
    ...overrides,
  };
}

function snapshot(
  events: readonly FixedEvent[],
  overrides: Partial<ScheduleSnapshot> = {},
): ScheduleSnapshot {
  return {
    events,
    fetchedAt: now,
    source: 'modeus',
    status: 'ok',
    ...overrides,
  };
}

const past = event(
  'past',
  '2026-10-31T10:00-04:00[America/New_York]',
  '2026-10-31T11:00-04:00[America/New_York]',
);
const upcoming = event(
  'upcoming',
  '2026-11-01T11:00-05:00[America/New_York]',
  '2026-11-01T12:00-05:00[America/New_York]',
);

describe('schedule domain (F-13, AC-10)', () => {
  it('does not duplicate an event when the same source keys are merged twice', () => {
    const first = snapshot([upcoming]);
    expect(
      mergeSnapshot(mergeSnapshot(undefined, first), first).events,
    ).toEqual([upcoming]);
  });

  it('updates the time for an event with the same key', () => {
    const moved = event(
      'upcoming',
      '2026-11-01T13:00-05:00[America/New_York]',
      '2026-11-01T14:00-05:00[America/New_York]',
    );
    expect(
      mergeSnapshot(snapshot([upcoming]), snapshot([moved])).events,
    ).toEqual([moved]);
  });

  it('removes disappeared future events and retains disappeared past events', () => {
    const result = mergeSnapshot(snapshot([past, upcoming]), snapshot([]));
    expect(result.events).toEqual([past]);
  });

  it('retains the last good snapshot on source failure while its age grows', () => {
    const previous = snapshot([upcoming]);
    const failedAt = now.add({ hours: 2 });
    const failed = snapshot([], {
      fetchedAt: failedAt,
      status: 'error',
      lastError: 'offline',
    });
    const result = mergeSnapshot(previous, failed);
    expect(result.events).toEqual([upcoming]);
    expect(result.status).toBe('error');
    expect(ageOf(result, failedAt.add({ hours: 3 })).hours).toBe(5);
  });

  it('includes overnight events on each intersected day in the event timezone', () => {
    const overnight = event(
      'overnight',
      '2026-11-01T23:30-05:00[America/New_York]',
      '2026-11-02T01:00-05:00[America/New_York]',
    );
    const utcMorning = event(
      'utc',
      '2026-11-02T01:00+00:00[UTC]',
      '2026-11-02T02:00+00:00[UTC]',
    );
    expect(
      eventsOn(snapshot([overnight, utcMorning]), date).map(({ key }) => key),
    ).toEqual(['overnight']);
    expect(
      eventsOn(snapshot([overnight, utcMorning]), date.add({ days: 1 })).map(
        ({ key }) => key,
      ),
    ).toEqual(['overnight', 'utc']);
  });

  it('selects the next future event and skips passed or cancelled events', () => {
    const cancelled = event(
      'cancelled',
      '2026-11-01T09:00-05:00[America/New_York]',
      '2026-11-01T10:00-05:00[America/New_York]',
      { cancelled: true },
    );
    expect(nextEvent(snapshot([past, cancelled, upcoming]), now)).toEqual(
      upcoming,
    );
  });

  it('returns unknown without a snapshot or a failed snapshot without prior events', () => {
    const maxAge = Temporal.Duration.from({ hours: 1 });
    expect(availabilityOn(undefined, date, now, maxAge)).toBe('unknown');
    expect(
      availabilityOn(snapshot([], { status: 'error' }), date, now, maxAge),
    ).toBe('unknown');
  });

  it('does not call a stale schedule free', () => {
    const old = snapshot([], { fetchedAt: now.subtract({ hours: 2 }) });
    expect(
      availabilityOn(old, date, now, Temporal.Duration.from({ hours: 1 })),
    ).toBe('unknown');
  });
  it('reports fresh scheduled days as busy and empty days as free', () => {
    const maxAge = Temporal.Duration.from({ hours: 1 });
    expect(availabilityOn(snapshot([upcoming]), date, now, maxAge)).toBe(
      'busy',
    );
    expect(availabilityOn(snapshot([]), date, now, maxAge)).toBe('free');
  });

  it('reports an overlap without changing the event or timed task interval', () => {
    const taskStart = at('2026-11-01T11:30-05:00[America/New_York]');
    const taskEnd = at('2026-11-01T12:30-05:00[America/New_York]');
    expect(overlappingEvents(snapshot([upcoming]), taskStart, taskEnd)).toEqual(
      [upcoming],
    );
    expect(upcoming.start.toString()).toContain('11:00:00');
  });

  it('keeps elapsed time correct across the daylight-saving transition', () => {
    const dstEvent = event(
      'dst',
      '2026-11-01T01:30-04:00[America/New_York]',
      '2026-11-01T01:30-05:00[America/New_York]',
    );
    expect(
      dstEvent.end.epochMilliseconds - dstEvent.start.epochMilliseconds,
    ).toBe(60 * 60 * 1000);
    expect(eventsOn(snapshot([dstEvent]), date)).toEqual([dstEvent]);
  });

  it('does not mutate inputs while merging snapshots', () => {
    const events = Object.freeze([past, upcoming]);
    const previous = snapshot(events);
    const incoming = snapshot([]);
    mergeSnapshot(previous, incoming);
    expect(previous.events).toEqual([past, upcoming]);
    expect(incoming.events).toEqual([]);
  });
});
