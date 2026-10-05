import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import type { Task } from '../task';
import { availableWorkdays, deadlineRisk } from './risk';

const today = Temporal.PlainDate.from('2026-10-05');
const weekdays = new Set([1, 2, 3, 4, 5]);
const saturdayWeek = new Set([1, 2, 3, 4, 5, 6]);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task',
    title: 'Задача',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 0,
    ...overrides,
  };
}

describe('availableWorkdays', () => {
  it('counts inclusively and handles reversed and empty intervals', () => {
    expect(availableWorkdays(today, today.add({ days: 4 }), weekdays)).toEqual({
      ok: true,
      value: 5,
    });
    expect(availableWorkdays(today.add({ days: 1 }), today, weekdays)).toEqual({
      ok: true,
      value: 0,
    });
    expect(availableWorkdays(today, today.add({ days: 4 }), new Set())).toEqual(
      { ok: false, error: 'empty-workdays' },
    );
  });

  it('calculates a two-year interval using the weekday arithmetic result', () => {
    const due = today.add({ years: 2 });
    let expected = 0;
    for (
      let date = today;
      Temporal.PlainDate.compare(date, due) <= 0;
      date = date.add({ days: 1 })
    ) {
      if (weekdays.has(date.dayOfWeek)) expected += 1;
    }
    expect(availableWorkdays(today, due, weekdays)).toEqual({
      ok: true,
      value: expected,
    });
  });
});

describe('deadlineRisk (F-15 / AC-09)', () => {
  const cases: ReadonlyArray<{
    name: string;
    today: Temporal.PlainDate;
    day?: Temporal.PlainDate;
    due?: Temporal.PlainDate;
    estimate?: number;
    workdays?: ReadonlySet<number>;
    status?: Task['status'];
    expected: string;
    available?: number;
  }> = [
    {
      name: 'AC-09 row 1 has slack',
      today,
      day: today,
      due: today.add({ days: 4 }),
      estimate: 3,
      expected: 'ok',
      available: 5,
    },
    {
      name: 'AC-09 row 2 exhausts the slack',
      today,
      due: today.add({ days: 4 }),
      estimate: 5,
      expected: 'tight',
      available: 5,
    },
    {
      name: 'AC-09 row 3 is tight on Tuesday',
      today: today.add({ days: 1 }),
      due: today.add({ days: 4 }),
      estimate: 4,
      expected: 'tight',
      available: 4,
    },
    {
      name: 'AC-09 row 4 is short',
      today: today.add({ days: 3 }),
      due: today.add({ days: 4 }),
      estimate: 4,
      expected: 'short',
      available: 2,
    },
    {
      name: 'AC-09 row 5 keeps one day of risk visible',
      today: today.add({ days: 4 }),
      due: today.add({ days: 4 }),
      estimate: 4,
      expected: 'short',
      available: 1,
    },
    {
      name: 'AC-09 row 6 excludes weekend before Monday deadline',
      today: today.add({ days: 5 }),
      due: today.add({ days: 7 }),
      estimate: 1,
      expected: 'tight',
      available: 1,
    },
    {
      name: 'AC-09 row 7 has no workdays before Sunday deadline',
      today: today.add({ days: 5 }),
      due: today.add({ days: 6 }),
      estimate: 1,
      expected: 'short',
      available: 0,
    },
    {
      name: 'AC-09 row 8 starts on the future task day',
      today,
      day: today.add({ days: 2 }),
      due: today.add({ days: 4 }),
      estimate: 3,
      expected: 'tight',
      available: 3,
    },
    {
      name: 'AC-09 row 9 uses a Saturday workday',
      today,
      due: today.add({ days: 5 }),
      estimate: 6,
      workdays: saturdayWeek,
      expected: 'tight',
      available: 6,
    },
    {
      name: 'AC-09 row 10 has unknown estimate',
      today,
      due: today.add({ days: 4 }),
      expected: 'unknown',
      available: 5,
    },
    {
      name: 'AC-09 row 11 has no due date',
      today,
      estimate: 4,
      expected: 'none',
    },
    {
      name: 'AC-09 row 12 is overdue',
      today: today.add({ days: 4 }),
      due: today.add({ days: 3 }),
      estimate: 2,
      expected: 'overdue',
      available: 0,
    },
    {
      name: 'AC-09 row 13 ignores completed tasks',
      today,
      due: today.add({ days: 4 }),
      estimate: 3,
      status: { kind: 'done' },
      expected: 'none',
    },
  ];

  it.each(cases)(
    '$name',
    ({
      today: currentDay,
      day,
      due,
      estimate,
      workdays,
      status,
      expected,
      available,
    }) => {
      const result = deadlineRisk(
        task({
          ...(day ? { day } : {}),
          ...(due ? { deadline: due } : {}),
          ...(estimate === undefined
            ? {}
            : { estimate: { unit: 'workdays', value: estimate } }),
          status: status ?? { kind: 'todo' },
        }),
        currentDay,
        workdays ?? weekdays,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.risk).toBe(expected);
      expect(result.available).toBe(available);
    },
  );

  it('rejects invalid estimates and an empty workday set', () => {
    for (const value of [0, -1, 1.5]) {
      expect(
        deadlineRisk(
          task({ deadline: today, estimate: { unit: 'workdays', value } }),
          today,
          weekdays,
        ),
      ).toEqual({ ok: false, error: value < 1 ? 'below-one' : 'not-integer' });
    }
    expect(deadlineRisk(task({ deadline: today }), today, new Set())).toEqual({
      ok: false,
      error: 'empty-workdays',
    });
  });

  it('reports when the task start is after its due date', () => {
    const result = deadlineRisk(
      task({
        day: today.add({ days: 5 }),
        deadline: today.add({ days: 4 }),
        estimate: { unit: 'workdays', value: 1 },
      }),
      today,
      weekdays,
    );
    expect(result).toMatchObject({
      ok: true,
      risk: 'short',
      available: 0,
      startsAfterDue: true,
    });
  });

  it('treats waiting tasks like todo tasks', () => {
    const result = deadlineRisk(
      task({
        status: { kind: 'waiting', reason: 'Ответ' },
        deadline: today.add({ days: 4 }),
        estimate: { unit: 'workdays', value: 5 },
      }),
      today,
      weekdays,
    );
    expect(result).toMatchObject({ ok: true, risk: 'tight' });
  });

  it('returns the same result for the same input', () => {
    const input = task({
      deadline: today.add({ days: 4 }),
      estimate: { unit: 'workdays', value: 5 },
    });
    expect(deadlineRisk(input, today, weekdays)).toEqual(
      deadlineRisk(input, today, weekdays),
    );
  });
});
