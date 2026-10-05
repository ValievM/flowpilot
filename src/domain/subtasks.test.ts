import { describe, expect, it } from 'vitest';
import { updateSubtask, type Task } from './index';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task',
    title: 'Задача',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [{ id: 'subtask', title: 'Пункт', completed: false }],
    comments: [],
    attachments: [],
    addedOrder: 0,
    ...overrides,
  };
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
      { id: 'subtask', title: 'Пункт', completed: true },
    ]);
  });
});
