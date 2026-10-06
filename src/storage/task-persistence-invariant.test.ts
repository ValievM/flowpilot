import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import type { Task } from '../domain';
import { commandSchema } from '../shared/command-schema';
import { Repository } from './index';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };
const taskFields = [
  'id',
  'title',
  'description',
  'status',
  'columnId',
  'typeId',
  'disciplineId',
  'day',
  'time',
  'deadline',
  'estimate',
  'subtasks',
  'comments',
  'attachments',
  'rolledOverFrom',
  'aiRank',
  'addedOrder',
] as const satisfies readonly (keyof Task)[];
const taskFieldsComplete: Exclude<
  keyof Task,
  (typeof taskFields)[number]
> extends never
  ? true
  : never = true;
const rejectedFields = ['typeId', 'disciplineId', 'aiRank'] as const;

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Task persistence invariant', () => {
  it('accounts explicitly for every Task field and round-trips persisted fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-task-fields-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const task: Task = {
      id: 'task-1',
      title: 'Task',
      description: 'Description',
      status: { kind: 'todo' },
      columnId: 'todo',
      typeId: 'type-1',
      disciplineId: 'discipline-1',
      day: Temporal.PlainDate.from('2026-10-05'),
      time: Temporal.PlainTime.from('13:30'),
      deadline: Temporal.PlainDate.from('2026-10-08'),
      estimate: { unit: 'workdays', value: 2 },
      subtasks: [],
      comments: [],
      attachments: [],
      rolledOverFrom: Temporal.PlainDate.from('2026-10-04'),
      aiRank: 1,
      addedOrder: 0,
    };
    expect(taskFieldsComplete).toBe(true);
    expect(taskFields).toHaveLength(Object.keys(task).length);
    const { typeId, disciplineId, aiRank, ...persistedTask } = task;
    expect(typeId).toBe('type-1');
    expect(disciplineId).toBe('discipline-1');
    expect(aiRank).toBe(1);
    const acceptedCommand = {
      kind: 'task.create',
      task: persistedTask,
    } as const;
    expect(commandSchema.safeParse(acceptedCommand).success).toBe(true);
    const repository = new Repository(path, clock);
    expect(repository.apply([acceptedCommand], 0).ok).toBe(true);
    repository.close();
    const reopened = new Repository(path, clock);
    expect(reopened.load().tasks).toEqual([persistedTask]);
    reopened.close();
  });

  it('rejects each unpersisted create field without changing the repository', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-task-fields-'));
    directories.push(directory);
    const repository = new Repository(join(directory, 'tasks.sqlite'), clock);
    const task: Task = {
      id: 'task-1',
      title: 'Task',
      status: { kind: 'todo' },
      columnId: 'todo',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    };
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    const rejectedCreates = [
      {
        field: 'typeId',
        command: {
          kind: 'task.create',
          task: { ...task, id: 'task-type', typeId: 'type-1' },
        },
      },
      {
        field: 'disciplineId',
        command: {
          kind: 'task.create',
          task: {
            ...task,
            id: 'task-discipline',
            disciplineId: 'discipline-1',
          },
        },
      },
      {
        field: 'aiRank',
        command: {
          kind: 'task.create',
          task: { ...task, id: 'task-rank', aiRank: 1 },
        },
      },
    ] as const;
    for (const { field, command } of rejectedCreates) {
      const snapshotBefore = repository.load();
      const revision = snapshotBefore.revision;
      expect(
        commandSchema.safeParse(command).success,
        `${field} schema rejection`,
      ).toBe(false);
      expect(repository.apply([command], revision)).toMatchObject({
        ok: false,
        error: { kind: 'InvalidCommand' },
      });
      expect(repository.load()).toEqual(snapshotBefore);
      expect(repository.load().revision).toBe(revision);
    }
    repository.close();
  });

  it('rejects unpersisted update fields without changing the repository', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-task-fields-'));
    directories.push(directory);
    const repository = new Repository(join(directory, 'tasks.sqlite'), clock);
    const task: Task = {
      id: 'task-1',
      title: 'Task',
      status: { kind: 'todo' },
      columnId: 'todo',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    };
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    const revision = repository.load().revision;
    for (const field of rejectedFields) {
      const snapshotBeforeRejectedUpdate = repository.load();
      const rejectedUpdate = repository.apply(
        [
          {
            kind: 'task.update',
            id: task.id,
            changes: { [field]: field === 'aiRank' ? 1 : 'catalog-id' },
          },
        ],
        revision,
      );
      expect(rejectedUpdate).toMatchObject({
        ok: false,
        error: { kind: 'InvalidCommand' },
      });
      expect(repository.load()).toEqual(snapshotBeforeRejectedUpdate);
      expect(repository.load().revision).toBe(revision);
    }
    repository.close();
  });
});
