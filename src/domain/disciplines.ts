import type { Discipline, Task } from './task';

export type AddDisciplineResult =
  | { ok: true; catalog: Discipline[] }
  | { ok: false; error: 'empty-name' | 'duplicate-name' | 'invalid-color' };

export type RenameDisciplineResult =
  | { ok: true; catalog: Discipline[] }
  | { ok: false; error: 'not-found' | 'empty-name' | 'duplicate-name' };

export interface RemoveDisciplineOptions {
  targetId?: string;
  detach?: boolean;
}

export type RemoveDisciplineResult =
  | { ok: true; catalog: Discipline[]; tasks: Task[] }
  | { ok: false; error: 'not-found' | 'target-required' | 'invalid-target' };

export function addDiscipline(
  catalog: readonly Discipline[],
  id: string,
  name: string,
  color?: string,
): AddDisciplineResult {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: 'empty-name' };
  if (
    catalog.some(
      (item) => item.name.toLowerCase() === trimmedName.toLowerCase(),
    )
  ) {
    return { ok: false, error: 'duplicate-name' };
  }
  const isSupportedColor =
    color === undefined ||
    color === 'study' ||
    color === 'health' ||
    color === 'personal' ||
    color === 'none';
  if (!isSupportedColor) return { ok: false, error: 'invalid-color' };
  const item: Discipline =
    color === undefined
      ? { id, name: trimmedName }
      : { id, name: trimmedName, color };
  return { ok: true, catalog: [...catalog, item] };
}

export function renameDiscipline(
  catalog: readonly Discipline[],
  id: string,
  name: string,
): RenameDisciplineResult {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: 'empty-name' };
  if (!catalog.some((item) => item.id === id))
    return { ok: false, error: 'not-found' };
  if (
    catalog.some(
      (item) =>
        item.id !== id && item.name.toLowerCase() === trimmedName.toLowerCase(),
    )
  ) {
    return { ok: false, error: 'duplicate-name' };
  }
  return {
    ok: true,
    catalog: catalog.map((item) =>
      item.id === id ? { ...item, name: trimmedName } : item,
    ),
  };
}

export function removeDiscipline(
  catalog: readonly Discipline[],
  tasks: readonly Task[],
  id: string,
  options: RemoveDisciplineOptions = {},
): RemoveDisciplineResult {
  if (!catalog.some((item) => item.id === id))
    return { ok: false, error: 'not-found' };
  const hasLinkedTasks = tasks.some((task) => task.disciplineId === id);
  if (hasLinkedTasks && !options.targetId && !options.detach) {
    return { ok: false, error: 'target-required' };
  }
  if (
    options.targetId &&
    (options.targetId === id ||
      !catalog.some((item) => item.id === options.targetId))
  ) {
    return { ok: false, error: 'invalid-target' };
  }
  return {
    ok: true,
    catalog: catalog.filter((item) => item.id !== id),
    tasks: tasks.map((task) => {
      if (task.disciplineId !== id) return task;
      if (options.targetId) return { ...task, disciplineId: options.targetId };
      const detachedTask = { ...task };
      delete detachedTask.disciplineId;
      return detachedTask;
    }),
  };
}
