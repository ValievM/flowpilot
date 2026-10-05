import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { rollOver, type Task } from './index';

const today = Temporal.PlainDate.from('2026-10-05');
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

describe('rollOver', () => {
  it('retains the first source date across repeated rollover', () => {
    const originalDay = today.subtract({ days: 2 });
    const moved = rollOver([task({ day: originalDay })], today)[0];
    expect(moved?.rolledOverFrom?.equals(originalDay)).toBe(true);
    const repeated = rollOver(moved ? [moved] : [], today.add({ days: 1 }))[0];
    expect(repeated?.rolledOverFrom?.equals(originalDay)).toBe(true);
  });

  it('does not change an undated task', () => {
    const undated = task();
    expect(rollOver([undated], today)[0]).toBe(undated);
  });

  it('does not change a task already scheduled today', () => {
    const scheduled = task({ day: today });
    expect(rollOver([scheduled], today)[0]).toBe(scheduled);
  });

  it('does not change a completed task from yesterday', () => {
    const completed = task({
      day: today.subtract({ days: 1 }),
      status: { kind: 'done' },
      columnId: 'done',
    });
    expect(rollOver([completed], today)[0]).toBe(completed);
  });
  it('moves an active task to today without changing id or deadline', () => {
    const deadline = today.add({ days: 4 });
    const active = task({
      id: 'same-id',
      status: { kind: 'doing' },
      columnId: 'doing',
      day: today.subtract({ days: 1 }),
      deadline,
    });
    const moved = rollOver([active], today)[0];
    expect(moved).toMatchObject({ id: 'same-id', deadline });
    expect(moved?.day?.equals(today)).toBe(true);
  });

  it('does not move waiting or future tasks', () => {
    const waiting = task({
      status: { kind: 'waiting', reason: 'Ответ' },
      columnId: 'waiting',
      day: today.subtract({ days: 1 }),
    });
    const future = task({ id: 'future', day: today.add({ days: 1 }) });
    const result = rollOver([waiting, future], today);
    expect(result).toEqual([waiting, future]);
    expect(result[0]).toBe(waiting);
    expect(result[1]).toBe(future);
  });

  it('is idempotent for another rollover on the same day', () => {
    const active = task({ day: today.subtract({ days: 1 }) });
    const once = rollOver([active], today);
    const twice = rollOver(once, today);
    expect(twice).toEqual(once);
    expect(twice[0]).toBe(once[0]);
  });
});
