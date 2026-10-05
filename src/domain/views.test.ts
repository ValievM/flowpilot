import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { laterView, nowView, todayView, type Task } from './index';

const today = Temporal.PlainDate.from('2026-10-05');
const now = Temporal.PlainTime.from('13:20');

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

describe('task views', () => {
  it('includes a task whose start time equals now in now view', () => {
    const scheduled = task({ day: today, time: now });
    expect(nowView([scheduled], today, now)).toEqual([scheduled]);
  });

  it('includes waiting and completed tasks scheduled today in today view', () => {
    const waiting = task({
      id: 'waiting',
      day: today,
      status: { kind: 'waiting', reason: 'Ответ' },
    });
    const done = task({ id: 'done', day: today, status: { kind: 'done' } });
    expect(todayView([waiting, done], today)).toEqual([waiting, done]);
  });

  it('does not include a task scheduled today in later view', () => {
    const scheduled = task({ day: today });
    expect(laterView([scheduled], today)).toEqual([]);
  });

  it('orders equal-deadline tasks by added order in later view', () => {
    const later = task({
      id: 'later',
      day: today.add({ days: 1 }),
      deadline: today.add({ days: 4 }),
      addedOrder: 3,
    });
    const earlier = task({
      id: 'earlier',
      day: today.add({ days: 1 }),
      deadline: today.add({ days: 4 }),
      addedOrder: 1,
    });
    expect(laterView([later, earlier], today).map(({ id }) => id)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('orders now view by nearest deadline then added order', () => {
    const later = task({
      id: 'later',
      day: today,
      deadline: today.add({ days: 4 }),
      addedOrder: 3,
    });
    const earlier = task({
      id: 'earlier',
      day: today,
      deadline: today.add({ days: 4 }),
      addedOrder: 1,
    });
    expect(nowView([later, earlier], today, now).map(({ id }) => id)).toEqual([
      'earlier',
      'later',
    ]);
  });
  it('shows undated tasks in later but not in now', () => {
    const undated = task();
    expect(laterView([undated], today)).toEqual([undated]);
    expect(nowView([undated], today, now)).toEqual([]);
  });

  it('keeps a future start time out of now but in today', () => {
    const scheduled = task({
      day: today,
      time: Temporal.PlainTime.from('15:00'),
    });
    expect(nowView([scheduled], today, now)).toEqual([]);
    expect(todayView([scheduled], today)).toEqual([scheduled]);
  });

  it('shows a task scheduled today in now', () => {
    const scheduled = task({ day: today });
    expect(nowView([scheduled], today, now)).toEqual([scheduled]);
  });

  it('excludes waiting and done from now and later, retaining future and undated tasks in later', () => {
    const future = task({ id: 'future', day: today.add({ days: 1 }) });
    const undated = task({ id: 'undated' });
    const waiting = task({
      id: 'waiting',
      day: today,
      status: { kind: 'waiting', reason: 'Ответ' },
    });
    const done = task({ id: 'done', day: today, status: { kind: 'done' } });
    expect(nowView([waiting, done], today, now)).toEqual([]);
    expect(laterView([future, undated, waiting, done], today)).toEqual([
      future,
      undated,
    ]);
  });

  it('orders different deadlines before undated deadline tasks', () => {
    const week = task({
      id: 'week',
      deadline: today.add({ days: 7 }),
      addedOrder: 0,
    });
    const noDeadline = task({ id: 'none', addedOrder: 1 });
    const tomorrow = task({
      id: 'tomorrow',
      deadline: today.add({ days: 1 }),
      addedOrder: 2,
    });
    expect(
      laterView([week, noDeadline, tomorrow], today).map(({ id }) => id),
    ).toEqual(['tomorrow', 'week', 'none']);
  });
});
