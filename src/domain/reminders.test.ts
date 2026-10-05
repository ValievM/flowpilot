import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { planReminders } from './index';
import type { Task } from './task';

const now = Temporal.ZonedDateTime.from(
  '2026-10-05T14:20-04:00[America/New_York]',
);
const task = (id: string, time?: string): Task => ({
  id,
  title: id,
  status: { kind: 'todo' },
  columnId: 'todo',
  day: Temporal.PlainDate.from('2026-10-05'),
  ...(time ? { time: Temporal.PlainTime.from(time) } : {}),
  subtasks: [],
  comments: [],
  attachments: [],
  addedOrder: 0,
});
const settings = { enabled: true, leadMinutes: 10 };

const plan = (
  input: Parameters<typeof planReminders>[0],
  at = now,
  options = settings,
) => planReminders(input, at, options);

describe('planReminders', () => {
  it('plans fixed-event reminders at the configured lead time', () => {
    const result = plan({
      tasks: [],
      events: [
        {
          key: 'lecture',
          source: 'manual',
          title: 'Lecture',
          start: Temporal.ZonedDateTime.from(
            '2026-10-05T14:30-04:00[America/New_York]',
          ),
          end: Temporal.ZonedDateTime.from(
            '2026-10-05T15:30-04:00[America/New_York]',
          ),
        },
      ],
      instances: [],
      ledger: { sent: [], risks: {} },
    });
    expect(result.reminders.map((item) => item.at.toString())).toEqual([
      '2026-10-05T14:20:00-04:00[America/New_York]',
    ]);
  });

  it('plans exact-time tasks before their start', () => {
    const result = plan({
      tasks: [task('timed', '14:30')],
      events: [],
      instances: [],
      ledger: { sent: [], risks: {} },
    });
    expect(result.reminders.map((item) => item.key)).toEqual([
      'task:timed:2026-10-05',
    ]);
  });

  it('does not plan a task reminder without an exact time', () => {
    const result = plan({
      tasks: [task('untimed')],
      events: [],
      instances: [],
      ledger: { sent: [], risks: {} },
    });
    expect(result.reminders).toEqual([]);
  });

  it('notifies only on first transition into tight or short risk', () => {
    const risky = {
      ...task('deadline'),
      deadline: Temporal.PlainDate.from('2026-10-05'),
      estimate: { unit: 'workdays' as const, value: 1 },
    };
    const result = plan({
      tasks: [risky],
      events: [],
      instances: [],
      workdays: new Set([1, 2, 3, 4, 5, 6, 7]),
      ledger: { sent: [], risks: { deadline: 'ok' } },
    });
    expect(result.reminders.map((item) => item.title)).toEqual([
      'Риск не успеть',
    ]);
    expect(result.ledger.risks.deadline).toBe('tight');
    expect(
      plan({
        tasks: [risky],
        events: [],
        instances: [],
        workdays: new Set([1, 2, 3, 4, 5, 6, 7]),
        ledger: result.ledger,
      }).reminders,
    ).toEqual([]);
  });

  it('deduplicates a risk until its status disappears and returns', () => {
    const risky = {
      ...task('deadline'),
      deadline: Temporal.PlainDate.from('2026-10-05'),
      estimate: { unit: 'workdays' as const, value: 1 },
    };
    const result = plan({
      tasks: [risky],
      events: [],
      instances: [],
      workdays: new Set([1, 2, 3, 4, 5, 6, 7]),
      ledger: { sent: ['risk:deadline'], risks: { deadline: 'tight' } },
    });
    expect(result.reminders).toEqual([]);
    expect(result.ledger.risks.deadline).toBe('tight');
  });
  it('allows a new risk reminder after risk disappears and returns', () => {
    const due = (deadline: string) => ({
      ...task('deadline'),
      deadline: Temporal.PlainDate.from(deadline),
      estimate: { unit: 'workdays' as const, value: 1 },
    });
    const workdays = new Set([1, 2, 3, 4, 5, 6, 7]);
    const input = {
      tasks: [due('2026-10-10')],
      events: [],
      instances: [],
      workdays,
      ledger: { sent: [], risks: {} },
    };
    const safe = plan(input);
    const firstRisk = plan({
      ...input,
      tasks: [due('2026-10-05')],
      ledger: safe.ledger,
    });
    const safeAgain = plan({ ...input, ledger: firstRisk.ledger });
    const returnedRisk = plan({
      ...input,
      tasks: [due('2026-10-05')],
      ledger: safeAgain.ledger,
    });
    expect(firstRisk.reminders).toHaveLength(1);
    expect(returnedRisk.reminders).toHaveLength(1);
  });

  it('does not notify for a card move already represented in the ledger', () => {
    const result = plan({
      tasks: [{ ...task('timed', '14:30'), columnId: 'doing' }],
      events: [],
      instances: [],
      ledger: { sent: ['task:timed:2026-10-05'], risks: {} },
    });
    expect(result.reminders).toEqual([]);
  });

  it('does not create reminders when the feature is disabled', () => {
    const result = plan(
      {
        tasks: [task('timed', '14:30')],
        events: [],
        instances: [],
        ledger: { sent: [], risks: {} },
      },
      now,
      { enabled: false, leadMinutes: 10 },
    );
    expect(result.reminders).toEqual([]);
  });
  it('defaults reminders to disabled', () => {
    const result = planReminders(
      {
        tasks: [task('timed', '14:30')],
        events: [],
        instances: [],
        ledger: { sent: [], risks: {} },
      },
      now,
    );
    expect(result.reminders).toEqual([]);
  });

  it('skips reminders overdue beyond the staleness limit and retains current ones', () => {
    const result = plan({
      tasks: [task('old', '09:00'), task('current', '14:30')],
      events: [],
      instances: [],
      ledger: { sent: [], risks: {} },
    });
    expect(result.reminders.map((item) => item.key)).toEqual([
      'task:current:2026-10-05',
    ]);
  });

  it('plans timed recurring instances for their occurrence date', () => {
    const result = plan({
      tasks: [],
      events: [],
      ledger: { sent: [], risks: {} },
      instances: [
        {
          seriesId: 'training',
          date: Temporal.PlainDate.from('2026-10-05'),
          time: Temporal.PlainTime.from('14:30'),
          state: 'pending',
        },
      ],
    });
    expect(result.reminders.map((item) => item.key)).toEqual([
      'repeat:training:2026-10-05',
    ]);
  });

  it('returns equal plans for equal inputs', () => {
    const input = {
      tasks: [task('timed', '14:30')],
      events: [],
      instances: [],
      ledger: { sent: [], risks: {} },
    };
    expect(plan(input)).toEqual(plan(input));
  });
});
