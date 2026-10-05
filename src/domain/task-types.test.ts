import { describe, expect, it } from 'vitest';
import {
  addType,
  removeType,
  renameType,
  type Task,
  type TaskType,
} from './index';

const type = (id: string, name: string): TaskType => ({ id, name });
const task = (id: string, typeId?: string): Task => ({
  id,
  title: id,
  status: { kind: 'todo' },
  columnId: 'todo',
  ...(typeId === undefined ? {} : { typeId }),
  subtasks: [],
  comments: [],
  attachments: [],
  addedOrder: 0,
});

describe('task type catalog', () => {
  it('rejects blank names and case-insensitive duplicates', () => {
    expect(addType([], 'id', '  ')).toEqual({ ok: false, error: 'empty-name' });
    expect(addType([type('one', 'Study')], 'two', 'study')).toEqual({
      ok: false,
      error: 'duplicate-name',
    });
  });

  it('adds an item with a permitted color', () => {
    expect(addType([], 'study', 'Study', 'study')).toEqual({
      ok: true,
      catalog: [{ id: 'study', name: 'Study', color: 'study' }],
    });
  });

  it('rejects an unknown category color', () => {
    expect(addType([], 'id', 'Name', 'purple')).toEqual({
      ok: false,
      error: 'invalid-color',
    });
  });

  it('renames without changing stable ids or task associations', () => {
    const catalog = [type('one', 'Old')];
    const tasks = [task('task', 'one')];
    expect(renameType(catalog, 'one', 'New')).toEqual({
      ok: true,
      catalog: [type('one', 'New')],
    });
    expect(tasks).toEqual([task('task', 'one')]);
  });

  it('removes unused types and handles missing reassignment targets', () => {
    expect(removeType([type('one', 'One')], [], 'one')).toEqual({
      ok: true,
      catalog: [],
      tasks: [],
    });
    expect(
      removeType([type('one', 'One')], [task('task', 'one')], 'one'),
    ).toEqual({
      ok: false,
      error: 'target-required',
    });
  });

  it('reassigns or detaches all linked tasks without losing tasks', () => {
    const catalog = [type('one', 'One'), type('two', 'Two')];
    const tasks = [
      task('first', 'one'),
      task('unlinked'),
      task('second', 'one'),
    ];
    expect(removeType(catalog, tasks, 'one', { targetId: 'two' })).toEqual({
      ok: true,
      catalog: [type('two', 'Two')],
      tasks: [task('first', 'two'), task('unlinked'), task('second', 'two')],
    });
    expect(removeType(catalog, tasks, 'one', { detach: true })).toEqual({
      ok: true,
      catalog: [type('two', 'Two')],
      tasks: [task('first'), task('unlinked'), task('second')],
    });
  });

  it('rejects the removed item as a target', () => {
    expect(
      removeType([type('one', 'One')], [task('task', 'one')], 'one', {
        targetId: 'one',
      }),
    ).toEqual({ ok: false, error: 'invalid-target' });
  });

  it('does not mutate frozen catalog or task inputs', () => {
    const catalog = Object.freeze([Object.freeze(type('one', 'One'))]);
    const tasks = Object.freeze([Object.freeze(task('task', 'one'))]);
    expect(removeType(catalog, tasks, 'one', { detach: true })).toMatchObject({
      ok: true,
      tasks: [{ id: 'task' }],
    });
    expect(catalog[0]?.name).toBe('One');
    expect(tasks[0]?.typeId).toBe('one');
  });
});
