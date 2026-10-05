import type { Task } from './task';

export type UpdateSubtaskResult =
  { ok: true; task: Task } | { ok: false; error: 'subtask-not-found' };

export function updateSubtask(
  task: Task,
  subtaskId: string,
  completed: boolean,
): UpdateSubtaskResult {
  if (!task.subtasks.some(({ id }) => id === subtaskId)) {
    return { ok: false, error: 'subtask-not-found' };
  }
  return {
    ok: true,
    task: {
      ...task,
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, completed } : subtask,
      ),
    },
  };
}
