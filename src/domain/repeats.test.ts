import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  availableNow,
  instancesOn,
  missed,
  rescheduleInstance,
  skipGroups,
} from './index';
import type { Outcome, Series } from './index';

const today = Temporal.PlainDate.from('2026-10-07');
const recordedAt = Temporal.Instant.from('2026-10-07T12:00:00Z');

function series(overrides: Partial<Series> = {}): Series {
  return {
    id: 'training',
    title: 'Тренировка',
    weekdays: [1, 3, 5],
    startsOn: Temporal.PlainDate.from('2026-10-05'),
    ...overrides,
  };
}

function outcome(
  kind: 'done' | 'skipped' | 'dismissed',
  date: Temporal.PlainDate,
  seriesId = 'training',
): Outcome {
  return { kind, seriesId, date, recordedAt };
}

describe('repeating series', () => {
  it('F-06: creates instances only on selected ISO weekdays', () => {
    expect(instancesOn(series(), [], today)?.state).toBe('pending');
    expect(
      instancesOn(series(), [], today.subtract({ days: 1 })),
    ).toBeUndefined();
  });

  it('F-06: keeps a timed instance visible before it becomes available', () => {
    const current = instancesOn(
      series({ time: Temporal.PlainTime.from('18:00') }),
      [],
      today,
    );
    expect(current).toBeDefined();
    if (!current) return;
    expect(availableNow(current, Temporal.PlainTime.from('17:00'))).toBe(false);
    expect(availableNow(current, Temporal.PlainTime.from('18:00'))).toBe(true);
  });

  it('F-06: completing today does not finish the series or tomorrow', () => {
    const done = [outcome('done', today)];
    expect(instancesOn(series(), done, today)?.state).toBe('done');
    expect(instancesOn(series(), done, today.add({ days: 2 }))?.state).toBe(
      'pending',
    );
  });

  it('F-06: retains yesterday as missed while showing today separately', () => {
    const recurring = series({ weekdays: [2, 3] });
    const previous = missed(recurring, [], today);
    expect(previous.map((entry) => entry.date.toString())).toEqual([
      '2026-10-06',
    ]);
    expect(instancesOn(recurring, [], today)?.date.equals(today)).toBe(true);
  });

  it('F-06: groups five old missed dates from one series once', () => {
    const from = Temporal.PlainDate.from('2026-09-25');
    const group = skipGroups([series({ startsOn: from })], [], today);
    expect(group).toHaveLength(1);
    expect(group[0]).toMatchObject({ seriesId: 'training', count: 5 });
    expect(group[0]?.dates.map(String)).toEqual([
      '2026-09-25',
      '2026-09-28',
      '2026-09-30',
      '2026-10-02',
      '2026-10-05',
    ]);
  });

  it('F-06: creates separate missed groups per series', () => {
    const second = series({ id: 'reading', weekdays: [2, 3] });
    expect(skipGroups([series(), second], [], today)).toHaveLength(2);
  });

  it('F-06: keeps an explicitly skipped current instance in its group', () => {
    const groups = skipGroups([series()], [outcome('skipped', today)], today);
    expect(groups[0]?.dates.map(String)).toContain(today.toString());
  });

  it('F-06: dismissing a missed item hides it without deleting the outcome', () => {
    const dismissal = outcome('dismissed', today.subtract({ days: 2 }));
    expect(skipGroups([series()], [dismissal], today)).toEqual([]);
    expect(dismissal).toMatchObject({
      kind: 'dismissed',
      seriesId: 'training',
    });
  });

  it('F-06: changes a fixed time only through an explicit reschedule result', () => {
    const fixed = series({ time: Temporal.PlainTime.from('18:00') });
    expect(instancesOn(fixed, [], today)?.time?.toString()).toBe('18:00:00');
    const moved = rescheduleInstance(
      fixed,
      today,
      today.add({ days: 1 }),
      Temporal.PlainTime.from('19:00'),
    );
    expect(moved.kind).toBe('rescheduled');
    expect(moved.newTime.toString()).toBe('19:00:00');
    const persistedMove: Outcome = { ...moved, recordedAt };
    expect(
      instancesOn(fixed, [persistedMove], moved.newDate)?.time?.toString(),
    ).toBe('19:00:00');
    const completedMove = outcome('done', moved.newDate);
    expect(
      instancesOn(fixed, [persistedMove, completedMove], moved.newDate),
    ).toMatchObject({
      state: 'done',
      time: Temporal.PlainTime.from('19:00'),
    });
    expect(instancesOn(fixed, [], today)?.time?.toString()).toBe('18:00:00');
  });

  it('F-06: respects start and end dates', () => {
    expect(
      instancesOn(series({ startsOn: today.add({ days: 1 }) }), [], today),
    ).toBeUndefined();
    expect(
      instancesOn(series({ endsOn: today.subtract({ days: 1 }) }), [], today),
    ).toBeUndefined();
  });

  it('F-06: retains all matching dates across forty days in one group', () => {
    const start = today.subtract({ days: 40 });
    const scheduledCount = Array.from({ length: 40 }, (_, index) =>
      start.add({ days: index }),
    ).filter((date) => [1, 3, 5].includes(date.dayOfWeek)).length;
    const groups = skipGroups([series({ startsOn: start })], [], today);
    expect(groups[0]?.count).toBe(scheduledCount);
  });

  it('F-06: completing an earlier occurrence removes it from missed dates', () => {
    const earlierDate = today.subtract({ days: 2 });
    expect(
      missed(series(), [outcome('done', earlierDate)], today).map((entry) =>
        entry.date.toString(),
      ),
    ).not.toContain(earlierDate.toString());
  });

  it('F-06: is deterministic for identical inputs', () => {
    const outcomes = [outcome('skipped', today)];
    expect(skipGroups([series()], outcomes, today)).toEqual(
      skipGroups([series()], outcomes, today),
    );
  });
});
