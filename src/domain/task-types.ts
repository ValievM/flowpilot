import type { Task, TaskType } from './task';

export type AddTypeResult =
  | { ok: true; catalog: TaskType[] }
  | { ok: false; error: 'empty-name' | 'duplicate-name' | 'invalid-color' };

export type RenameTypeResult =
  | { ok: true; catalog: TaskType[] }
  | { ok: false; error: 'not-found' | 'empty-name' | 'duplicate-name' };

export interface RemoveTypeOptions {
  targetId?: string;
  detach?: boolean;
}

export type RemoveTypeResult =
  | { ok: true; catalog: TaskType[]; tasks: Task[] }
  | { ok: false; error: 'not-found' | 'target-required' | 'invalid-target' };

export function addType(
  catalog: readonly TaskType[],
  id: string,
  name: string,
  color?: string,
): AddTypeResult {
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
  const item: TaskType =
    color === undefined
      ? { id, name: trimmedName }
      : { id, name: trimmedName, color };
  return { ok: true, catalog: [...catalog, item] };
}

export function renameType(
  catalog: readonly TaskType[],
  id: string,
  name: string,
): RenameTypeResult {
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

export interface RemoveTypeOptions {
  targetId?: string;
  detach?: boolean;
}

export function removeType(
  catalog: readonly TaskType[],
  tasks: readonly Task[],
  id: string,
  options: RemoveTypeOptions = {},
): RemoveTypeResult {
  if (!catalog.some((item) => item.id === id))
    return { ok: false, error: 'not-found' };
  const hasLinkedTasks = tasks.some((task) => task.typeId === id);
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
      if (task.typeId !== id) return task;
      if (options.targetId) return { ...task, typeId: options.targetId };
      const detachedTask = { ...task };
      delete detachedTask.typeId;
      return detachedTask;
    }),
  };
}
