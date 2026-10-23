import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import type { ScheduleSourceSnapshot } from '../../shared/schedule-contracts';
import { buildSchedulePlan, conflictingEvents } from './schedule-model';

const zone = 'Europe/Moscow';
const now = Temporal.ZonedDateTime.from(
  '2026-10-05T13:20:00+03:00[Europe/Moscow]',
);

function imported(
  events: {
    key: string;
    title: string;
    start: string;
    end: string;
    place?: string;
    cancelled?: boolean;
  }[],
  overrides: Partial<ScheduleSourceSnapshot> = {},
): ScheduleSourceSnapshot {
  return {
    source: 'ics',
    fetchedAt: '2026-10-05T09:50:00Z',
    status: 'ok',
    lastError: null,
    ageMilliseconds: 0,
    events: events.map((event) => ({
      key: event.key,
      source: 'ics' as const,
      title: event.title,
      startUtc: event.start,
      endUtc: event.end,
      timeZone: zone,
      ...(event.place ? { place: event.place } : {}),
      ...(event.cancelled ? { cancelled: true } : {}),
    })),
    ...overrides,
  };
}

const math = {
  key: 'math',
  title: 'Математика',
  start: '2026-10-05T11:30:00Z',
  end: '2026-10-05T13:00:00Z',
  place: 'ауд. 204',
};
const design = {
  key: 'design',
  title: 'Проектирование',
  start: '2026-10-05T13:15:00Z',
  end: '2026-10-05T14:45:00Z',
};

describe('schedule plan', () => {
  it('has no data and never says "free" without a snapshot', () => {
    const plan = buildSchedulePlan([], now);
    expect(plan.hasData).toBe(false);
    expect(plan.free).toBe(false);
  });

  it('lists today and the next events from a fresh snapshot', () => {
    const plan = buildSchedulePlan([imported([math, design])], now);
    expect(plan.today.map(({ title }) => title)).toEqual([
      'Математика',
      'Проектирование',
    ]);
    expect(plan.next.map(({ title }) => title)).toEqual([
      'Математика',
      'Проектирование',
    ]);
    expect(plan.free).toBe(false);
  });

  it('says "free" only after the last class of the day and only for a fresh, non-empty snapshot', () => {
    const late = Temporal.ZonedDateTime.from(
      '2026-10-05T18:00:00+03:00[Europe/Moscow]',
    );
    expect(buildSchedulePlan([imported([math, design])], late).free).toBe(true);
    expect(buildSchedulePlan([imported([])], late).free).toBe(false);
    const stale = imported([math, design], {
      fetchedAt: '2026-09-01T09:50:00Z',
    });
    expect(buildSchedulePlan([stale], late).free).toBe(false);
  });

  it('keeps the events and never says "free" when a source failed', () => {
    const failed = imported([math], { status: 'error', lastError: 'нет сети' });
    const late = Temporal.ZonedDateTime.from(
      '2026-10-05T18:00:00+03:00[Europe/Moscow]',
    );
    const plan = buildSchedulePlan([failed], late);
    expect(plan.today).toHaveLength(1);
    expect(plan.errors).toHaveLength(1);
    expect(plan.free).toBe(false);
  });

  it('does not say "free" while any one source is failing, even if another is fresh', () => {
    const late = Temporal.ZonedDateTime.from(
      '2026-10-05T18:00:00+03:00[Europe/Moscow]',
    );
    const healthy = imported([math, design]);
    const failing = imported([], {
      source: 'modeus',
      status: 'error',
      lastError: 'нет сети',
    });
    const plan = buildSchedulePlan([healthy, failing], late);
    expect(plan.errors).toHaveLength(1);
    expect(plan.free).toBe(false);
  });

  it('expands a manual weekly class and respects its period', () => {
    const manual = {
      source: 'manual',
      fetchedAt: '2026-10-05T08:00:00Z',
      status: 'ok',
      lastError: null,
      ageMilliseconds: 0,
      events: [
        {
          id: 'm1',
          title: 'Тренировка',
          timeZone: zone,
          weekdays: [1, 3],
          startTime: '18:00',
          endTime: '19:00',
          fromDate: '2026-10-05',
          throughDate: '2026-10-05',
        },
      ],
    } as ScheduleSourceSnapshot;
    const monday = buildSchedulePlan([manual], now);
    expect(monday.today.map(({ title }) => title)).toEqual(['Тренировка']);
    const wednesday = Temporal.ZonedDateTime.from(
      '2026-10-07T10:00:00+03:00[Europe/Moscow]',
    );
    expect(buildSchedulePlan([manual], wednesday).today).toEqual([]);
  });

  it('ignores cancelled classes in the day and in the next class', () => {
    const plan = buildSchedulePlan(
      [imported([{ ...math, cancelled: true }, design])],
      now,
    );
    expect(plan.today.map(({ title }) => title)).toEqual(['Проектирование']);
    expect(plan.nextClass?.title).toBe('Проектирование');
  });

  it('finds a task time that falls inside a class, and nothing else', () => {
    const plan = buildSchedulePlan([imported([math, design])], now);
    const at = (time: string) =>
      conflictingEvents(
        plan,
        Temporal.PlainDate.from('2026-10-05'),
        Temporal.PlainTime.from(time),
        zone,
      );
    expect(at('15:00').map(({ title }) => title)).toEqual(['Математика']);
    expect(at('16:30').map(({ title }) => title)).toEqual(['Проектирование']);
    expect(at('14:00')).toEqual([]);
    expect(at('18:00')).toEqual([]);
  });
});
