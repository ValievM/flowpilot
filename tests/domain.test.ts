import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_COLUMNS,
  createRemainingEstimate,
  laterView,
  nowView,
  updateSubtask,
  removeColumn,
  rollOver,
  todayView,
  type Task,
} from '../src/domain';

const today = Temporal.PlainDate.from('2026-10-05');
const time = Temporal.PlainTime.from('13:20');

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Задача',
    state: 'todo',
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 0,
    ...overrides,
  };
}

describe('remaining estimate', () => {
  it('accepts positive integer workdays only', () => {
    expect(createRemainingEstimate(1)).toEqual({ unit: 'workdays', value: 1 });
    expect(createRemainingEstimate(0)).toBeNull();
    expect(createRemainingEstimate(1.5)).toBeNull();
  });
});


describe('task views', () => {
  it('shows undated tasks in later, not now', () => {
    const undated = task();

    expect(laterView([undated], today)).toEqual([undated]);
    expect(nowView([undated], today, time)).toEqual([]);
  });

  it('shows a task scheduled today in now', () => {
    const scheduled = task({ day: today });

    expect(nowView([scheduled], today, time)).toEqual([scheduled]);
  });

  it('keeps a later start time out of now but in today', () => {
    const scheduled = task({ day: today, time: Temporal.PlainTime.from('15:00') });

    expect(nowView([scheduled], today, time)).toEqual([]);
    expect(todayView([scheduled], today)).toEqual([scheduled]);
  });

  it('excludes waiting and completed tasks from now', () => {
    const waiting = task({
      id: 'waiting',
      state: 'waiting',
      columnId: 'waiting',
      day: today,
      waiting: { reason: 'Ждёт ответа' },
    });
    const done = task({ id: 'done', state: 'done', columnId: 'done', day: today });

    expect(nowView([waiting, done], today, time)).toEqual([]);
  });

  it('shows future and undated tasks in later, but not waiting or done', () => {
    const future = task({ id: 'future', day: today.add({ days: 1 }) });
    const undated = task({ id: 'undated' });
    const waiting = task({ id: 'waiting', state: 'waiting', waiting: { reason: 'Ответ' } });
    const done = task({ id: 'done', state: 'done' });

    expect(laterView([future, undated, waiting, done], today)).toEqual([future, undated]);
  });

  it('orders by nearest explicit deadline then original insertion order', () => {
    const week = task({ id: 'week', deadline: today.add({ days: 7 }), addedOrder: 0 });
    const noDeadline = task({ id: 'none', addedOrder: 1 });
    const tomorrow = task({ id: 'tomorrow', deadline: today.add({ days: 1 }), addedOrder: 2 });

    expect(laterView([week, noDeadline, tomorrow], today).map(({ id }) => id)).toEqual([
      'tomorrow',
      'week',
      'none',
    ]);
  });
});

describe('rollOver', () => {
  it('moves yesterday active task to today without changing id or deadline', () => {
    const yesterday = task({
      id: 'same-id',
      state: 'doing',
      columnId: 'doing',
      day: today.subtract({ days: 1 }),
      deadline: today.add({ days: 4 }),
    });

    const [rolled] = rollOver([yesterday], today);

    expect(rolled).toBeDefined();
    if (!rolled) throw new Error('Expected rollover to retain the task');

    expect(rolled).toMatchObject({ id: 'same-id', rolledOver: true });
    expect(rolled.day?.equals(today)).toBe(true);
    expect(rolled.deadline?.equals(today.add({ days: 4 }))).toBe(true);
    expect(rollOver([yesterday], today)).toHaveLength(1);
  });

  it('does not move waiting or explicitly future tasks', () => {
    const waiting = task({
      id: 'waiting',
      state: 'waiting',
      columnId: 'waiting',
      day: today.subtract({ days: 1 }),
      waiting: { reason: 'Ответ' },
    });
    const future = task({ id: 'future', day: today.add({ days: 1 }) });

    expect(rollOver([waiting, future], today)).toEqual([waiting, future]);
  });

  it('is idempotent for a repeated rollover on the same day', () => {
    const yesterday = task({ day: today.subtract({ days: 1 }) });
    const once = rollOver([yesterday], today);

    expect(rollOver(once, today)).toEqual(once);
    expect(rollOver(once, today)[0]).toBe(once[0]);
  });
});

describe('columns', () => {
  it('requires a target when deleting a non-empty column and moves its tasks', () => {
    const source = task({ columnId: 'custom', state: 'doing' });
    const columns = [
      ...BUILT_IN_COLUMNS,
      { id: 'custom', name: 'Своя', description: 'Своя колонка', state: 'doing' as const, builtIn: false },
    ];

    expect(removeColumn(columns, [source], 'custom')).toEqual({ ok: false, error: 'target-required' });
    expect(removeColumn(columns, [source], 'custom', 'todo')).toEqual({
      ok: true,
      columns: BUILT_IN_COLUMNS,
      tasks: [expect.objectContaining({ id: source.id, columnId: 'todo', state: 'todo' })],
    });
  });

  it('does not complete a task when its last subtask is completed', () => {
    const parent = task({
      subtasks: [{ id: 'subtask', title: 'Пункт', completed: false }],
    });
    const updated = updateSubtask(parent, 'subtask', true);

    expect(updated?.subtasks[0]?.completed).toBe(true);
    expect(updated?.state).toBe('todo');
  });
});
