import { describe, expect, it } from 'vitest';
import {
  addDiscipline,
  removeDiscipline,
  renameDiscipline,
  type Discipline,
  type Task,
} from './index';

const discipline = (id: string, name: string): Discipline => ({ id, name });
const task = (id: string, disciplineId?: string): Task => ({
  id,
  title: id,
  status: { kind: 'todo' },
  columnId: 'todo',
  ...(disciplineId === undefined ? {} : { disciplineId }),
  subtasks: [],
  comments: [],
  attachments: [],
  addedOrder: 0,
});

describe('discipline catalog', () => {
  it('rejects blank names and case-insensitive duplicates', () => {
    expect(addDiscipline([], 'id', '  ')).toEqual({
      ok: false,
      error: 'empty-name',
    });
    expect(addDiscipline([discipline('one', 'Math')], 'two', 'MATH')).toEqual({
      ok: false,
      error: 'duplicate-name',
    });
  });

  it('adds an item with a permitted color', () => {
    expect(addDiscipline([], 'math', 'Math', 'health')).toEqual({
      ok: true,
      catalog: [{ id: 'math', name: 'Math', color: 'health' }],
    });
  });

  it('rejects an unknown category color', () => {
    expect(addDiscipline([], 'id', 'Name', 'purple')).toEqual({
      ok: false,
      error: 'invalid-color',
    });
  });

  it('renames without changing stable ids or task associations', () => {
    const catalog = [discipline('one', 'Old')];
    const tasks = [task('task', 'one')];
    expect(renameDiscipline(catalog, 'one', 'New')).toEqual({
      ok: true,
      catalog: [discipline('one', 'New')],
    });
    expect(tasks).toEqual([task('task', 'one')]);
  });

  it('removes unused disciplines and handles missing reassignment targets', () => {
    expect(removeDiscipline([discipline('one', 'One')], [], 'one')).toEqual({
      ok: true,
      catalog: [],
      tasks: [],
    });
    expect(
      removeDiscipline(
        [discipline('one', 'One')],
        [task('task', 'one')],
        'one',
      ),
    ).toEqual({
      ok: false,
      error: 'target-required',
    });
  });

  it('reassigns or detaches all linked tasks without losing tasks', () => {
    const catalog = [discipline('one', 'One'), discipline('two', 'Two')];
    const tasks = [
      task('first', 'one'),
      task('unlinked'),
      task('second', 'one'),
    ];
    expect(
      removeDiscipline(catalog, tasks, 'one', { targetId: 'two' }),
    ).toEqual({
      ok: true,
      catalog: [discipline('two', 'Two')],
      tasks: [task('first', 'two'), task('unlinked'), task('second', 'two')],
    });
    expect(removeDiscipline(catalog, tasks, 'one', { detach: true })).toEqual({
      ok: true,
      catalog: [discipline('two', 'Two')],
      tasks: [task('first'), task('unlinked'), task('second')],
    });
  });

  it('rejects the removed item as a target', () => {
    expect(
      removeDiscipline(
        [discipline('one', 'One')],
        [task('task', 'one')],
        'one',
        {
          targetId: 'one',
        },
      ),
    ).toEqual({ ok: false, error: 'invalid-target' });
  });

  it('does not mutate frozen catalog or task inputs', () => {
    const catalog = Object.freeze([Object.freeze(discipline('one', 'One'))]);
    const tasks = Object.freeze([Object.freeze(task('task', 'one'))]);
    expect(
      removeDiscipline(catalog, tasks, 'one', { detach: true }),
    ).toMatchObject({
      ok: true,
      tasks: [{ id: 'task' }],
    });
    expect(catalog[0]?.name).toBe('One');
    expect(tasks[0]?.disciplineId).toBe('one');
  });
});
