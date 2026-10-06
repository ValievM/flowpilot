import type { Task } from './task';

export const SUBTASK_TITLE_MAX_LENGTH = 200;

export type UpdateSubtaskResult =
  { ok: true; task: Task } | { ok: false; error: 'subtask-not-found' };

export type RenameSubtaskResult =
  | { ok: true; task: Task }
  | { ok: false; error: 'subtask-not-found' | SubtaskTitleError };

export type RemoveSubtaskResult =
  { ok: true; task: Task } | { ok: false; error: 'subtask-not-found' };

export type MoveSubtaskResult =
  | { ok: true; task: Task }
  | { ok: false; error: 'subtask-not-found' | 'subtask-position-out-of-range' };

type SubtaskTitleError = 'empty-subtask-title' | 'subtask-title-too-long';

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

export function renameSubtask(
  task: Task,
  subtaskId: string,
  title: string,
): RenameSubtaskResult {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return { ok: false, error: 'empty-subtask-title' };
  }
  if (trimmedTitle.length > SUBTASK_TITLE_MAX_LENGTH) {
    return { ok: false, error: 'subtask-title-too-long' };
  }
  if (!task.subtasks.some(({ id }) => id === subtaskId)) {
    return { ok: false, error: 'subtask-not-found' };
  }
  return {
    ok: true,
    task: {
      ...task,
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, title: trimmedTitle }
          : subtask,
      ),
    },
  };
}

export function removeSubtask(
  task: Task,
  subtaskId: string,
): RemoveSubtaskResult {
  if (!task.subtasks.some(({ id }) => id === subtaskId)) {
    return { ok: false, error: 'subtask-not-found' };
  }
  return {
    ok: true,
    task: {
      ...task,
      subtasks: task.subtasks
        .filter(({ id }) => id !== subtaskId)
        .map((subtask, position) => ({ ...subtask, position })),
    },
  };
}

export function moveSubtask(
  task: Task,
  subtaskId: string,
  position: number,
): MoveSubtaskResult {
  const index = task.subtasks.findIndex(({ id }) => id === subtaskId);
  if (index === -1) return { ok: false, error: 'subtask-not-found' };
  if (position < 0 || position >= task.subtasks.length) {
    return { ok: false, error: 'subtask-position-out-of-range' };
  }
  const withoutMoved = task.subtasks.filter(
    (_, currentIndex) => currentIndex !== index,
  );
  const reordered = [
    ...withoutMoved.slice(0, position),
    ...task.subtasks.slice(index, index + 1),
    ...withoutMoved.slice(position),
  ];
  return {
    ok: true,
    task: {
      ...task,
      subtasks: reordered.map((subtask, newPosition) => ({
        ...subtask,
        position: newPosition,
      })),
    },
  };
}
