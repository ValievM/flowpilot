import { describe, expect, it } from 'vitest';
import {
  moveSubtask,
  removeSubtask,
  renameSubtask,
  SUBTASK_TITLE_MAX_LENGTH,
  updateSubtask,
  type Task,
} from './index';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task',
    title: 'Задача',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [
      { id: 'subtask', title: 'Пункт', completed: false, position: 0 },
    ],
    comments: [],
    attachments: [],
    addedOrder: 0,
    ...overrides,
  };
}

function orderedTask(): Task {
  return task({
    subtasks: [
      { id: 'first', title: 'Первый', completed: false, position: 0 },
      { id: 'second', title: 'Второй', completed: true, position: 1 },
      { id: 'third', title: 'Третий', completed: false, position: 2 },
    ],
  });
}

describe('updateSubtask', () => {
  it('reports an unknown subtask without changing the source task', () => {
    const parent = task();
    const original = { ...parent, subtasks: [...parent.subtasks] };
    expect(updateSubtask(parent, 'missing', true)).toEqual({
      ok: false,
      error: 'subtask-not-found',
    });
    expect(parent).toEqual(original);
  });

  it('does not complete its parent when the final subtask is completed', () => {
    const parent = task();
    const result = updateSubtask(parent, 'subtask', true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.status).toEqual({ kind: 'todo' });
    expect(result.task.subtasks).toEqual([
      { id: 'subtask', title: 'Пункт', completed: true, position: 0 },
    ]);
  });
});

describe('renameSubtask', () => {
  it('rejects an empty title without changing the source task', () => {
    const parent = orderedTask();
    const original = { ...parent, subtasks: [...parent.subtasks] };
    expect(renameSubtask(parent, 'second', '   ')).toEqual({
      ok: false,
      error: 'empty-subtask-title',
    });
    expect(parent).toEqual(original);
  });

  it('rejects a title longer than the subtask title limit', () => {
    const parent = orderedTask();
    const longTitle = 'а'.repeat(SUBTASK_TITLE_MAX_LENGTH + 1);
    expect(renameSubtask(parent, 'second', longTitle)).toEqual({
      ok: false,
      error: 'subtask-title-too-long',
    });
  });

  it('reports an unknown subtask without changing the source task', () => {
    const parent = orderedTask();
    const original = { ...parent, subtasks: [...parent.subtasks] };
    expect(renameSubtask(parent, 'missing', 'Новое')).toEqual({
      ok: false,
      error: 'subtask-not-found',
    });
    expect(parent).toEqual(original);
  });

  it('renames the subtask and keeps completion, order, and positions', () => {
    const result = renameSubtask(orderedTask(), 'second', ' Изменённый ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.subtasks).toEqual([
      { id: 'first', title: 'Первый', completed: false, position: 0 },
      { id: 'second', title: 'Изменённый', completed: true, position: 1 },
      { id: 'third', title: 'Третий', completed: false, position: 2 },
    ]);
  });
});

describe('removeSubtask', () => {
  it('reports an unknown subtask without changing the source task', () => {
    const parent = orderedTask();
    const original = { ...parent, subtasks: [...parent.subtasks] };
    expect(removeSubtask(parent, 'missing')).toEqual({
      ok: false,
      error: 'subtask-not-found',
    });
    expect(parent).toEqual(original);
  });

  it('allows removing the last remaining subtask', () => {
    const result = removeSubtask(task(), 'subtask');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.subtasks).toEqual([]);
  });

  it('renumbers the remaining subtasks without gaps', () => {
    const result = removeSubtask(orderedTask(), 'second');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.subtasks).toEqual([
      { id: 'first', title: 'Первый', completed: false, position: 0 },
      { id: 'third', title: 'Третий', completed: false, position: 1 },
    ]);
  });
});

describe('moveSubtask', () => {
  it('moves a subtask to the start and renumbers positions', () => {
    const result = moveSubtask(orderedTask(), 'third', 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.subtasks).toEqual([
      { id: 'third', title: 'Третий', completed: false, position: 0 },
      { id: 'first', title: 'Первый', completed: false, position: 1 },
      { id: 'second', title: 'Второй', completed: true, position: 2 },
    ]);
  });

  it('moves a subtask to the end and renumbers positions', () => {
    const result = moveSubtask(orderedTask(), 'first', 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.subtasks).toEqual([
      { id: 'second', title: 'Второй', completed: true, position: 0 },
      { id: 'third', title: 'Третий', completed: false, position: 1 },
      { id: 'first', title: 'Первый', completed: false, position: 2 },
    ]);
  });

  it('keeps the order unchanged when moving to the current position', () => {
    const parent = orderedTask();
    const result = moveSubtask(parent, 'second', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.subtasks).toEqual(parent.subtasks);
  });

  it('rejects a position outside the list without changing the source task', () => {
    const parent = orderedTask();
    const original = { ...parent, subtasks: [...parent.subtasks] };
    expect(moveSubtask(parent, 'second', 3)).toEqual({
      ok: false,
      error: 'subtask-position-out-of-range',
    });
    expect(moveSubtask(parent, 'second', -1)).toEqual({
      ok: false,
      error: 'subtask-position-out-of-range',
    });
    expect(parent).toEqual(original);
  });

  it('reports an unknown subtask without changing the source task', () => {
    expect(moveSubtask(orderedTask(), 'missing', 0)).toEqual({
      ok: false,
      error: 'subtask-not-found',
    });
  });
});
