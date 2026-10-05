import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_COLUMNS,
  moveTask,
  removeColumn,
  type Task,
  type TaskColumn,
} from './index';

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
const customColumn: TaskColumn = {
  id: 'custom',
  name: 'Своя',
  description: 'Своя колонка',
  state: 'doing',
  builtIn: false,
};
const columns = [...BUILT_IN_COLUMNS, customColumn];
const waitingColumn: TaskColumn = {
  id: 'waiting',
  name: 'Ожидание',
  description: 'Ждёт',
  state: 'waiting',
  builtIn: true,
};
const todoColumn: TaskColumn = {
  id: 'todo',
  name: 'Сделать',
  description: 'Делать',
  state: 'todo',
  builtIn: true,
};

describe('moveTask', () => {
  it('requires a reason when moving into waiting', () => {
    expect(moveTask(task(), waitingColumn)).toEqual({
      ok: false,
      error: 'waiting-reason-required',
    });
  });

  it('sets matching status and retains the waiting reason', () => {
    const result = moveTask(task(), waitingColumn, { reason: 'Ждёт ответа' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.columnId).toBe('waiting');
    expect(result.task.status).toEqual({
      kind: 'waiting',
      reason: 'Ждёт ответа',
    });
  });

  it('clears waiting status when moving out of waiting', () => {
    const waiting = task({
      columnId: 'waiting',
      status: { kind: 'waiting', reason: 'Ответ' },
    });
    const result = moveTask(waiting, todoColumn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.columnId).toBe('todo');
    expect(result.task.status).toEqual({ kind: 'todo' });
  });
});

describe('removeColumn', () => {
  it('reports missing and built-in columns', () => {
    expect(removeColumn(columns, [], 'missing')).toEqual({
      ok: false,
      error: 'column-not-found',
    });
    expect(removeColumn(columns, [], 'todo')).toEqual({
      ok: false,
      error: 'built-in-column',
    });
  });

  it('rejects the source and an unknown target', () => {
    expect(
      removeColumn(columns, [], 'custom', { targetColumnId: 'custom' }),
    ).toEqual({ ok: false, error: 'invalid-target' });
    expect(
      removeColumn(columns, [], 'custom', { targetColumnId: 'missing' }),
    ).toEqual({ ok: false, error: 'invalid-target' });
  });

  it('removes an empty custom column without a target', () => {
    expect(removeColumn(columns, [], 'custom')).toEqual({
      ok: true,
      columns: BUILT_IN_COLUMNS,
      tasks: [],
    });
  });

  it('requires a waiting reason when moving cards to waiting', () => {
    const source = task({ columnId: 'custom', status: { kind: 'doing' } });
    expect(
      removeColumn(columns, [source], 'custom', { targetColumnId: 'waiting' }),
    ).toEqual({
      ok: false,
      error: 'waiting-reason-required',
    });
  });

  it('moves cards using target column semantics', () => {
    const source = task({ columnId: 'custom', status: { kind: 'doing' } });
    const result = removeColumn(columns, [source], 'custom', {
      targetColumnId: 'waiting',
      waiting: { reason: 'Ждёт ответа' },
    });
    expect(result).toEqual({
      ok: true,
      columns: BUILT_IN_COLUMNS,
      tasks: [
        expect.objectContaining({
          columnId: 'waiting',
          status: { kind: 'waiting', reason: 'Ждёт ответа' },
        }),
      ],
    });
  });
});
