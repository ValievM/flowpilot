import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './index';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): { repository: Repository; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-storage-'));
  directories.push(directory);
  const path = join(directory, 'tasks.sqlite');
  return { repository: new Repository(path, clock), path };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Repository', () => {
  it('migrates an empty database once and preserves the schema version', () => {
    const { repository, path } = openRepository();
    repository.close();
    const database = new Database(path);
    expect(database.pragma('user_version')).toEqual([{ user_version: 2 }]);
    database.close();
    const before = readFileSync(path);
    const reopened = new Repository(path, clock);
    expect(reopened.load().revision).toBe(0);
    reopened.close();
    expect(readFileSync(path)).toEqual(before);
  });

  it('round-trips a task through close and reopen', () => {
    const { repository, path } = openRepository();
    const task = {
      id: 'task-1',
      title: 'Write report',
      description: 'Draft',
      status: {
        kind: 'waiting' as const,
        reason: 'Review',
        until: Temporal.PlainDate.from('2026-10-07'),
      },
      columnId: 'waiting',
      day: Temporal.PlainDate.from('2026-10-05'),
      time: Temporal.PlainTime.from('13:30'),
      deadline: Temporal.PlainDate.from('2026-10-09'),
      estimate: { unit: 'workdays' as const, value: 3 },
      subtasks: [{ id: 'sub-1', title: 'Outline', completed: true }],
      comments: [{ id: 'comment-1', text: 'Initial note' }],
      attachments: [
        {
          id: 'file-1',
          name: 'notes.txt',
          mediaType: 'text/plain',
          sizeBytes: 24,
        },
      ],
      rolledOverFrom: Temporal.PlainDate.from('2026-10-04'),
      addedOrder: 42,
    };
    expect(repository.apply([{ kind: 'task.create', task }], 0)).toEqual({
      ok: true,
      value: { revision: 1 },
    });
    repository.close();
    const reopened = new Repository(path, clock);
    expect(reopened.load().tasks).toEqual([task]);
    reopened.close();
  });

  it('rejects stale revisions without applying a command', () => {
    const { repository } = openRepository();
    const result = repository.apply(
      [{ kind: 'setting.set', key: 'workdays', value: [1, 2, 3, 4, 5] }],
      5,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'StaleRevision', expected: 5, actual: 0 },
    });
    expect(repository.load().revision).toBe(0);
    repository.close();
  });

  it('rolls back a whole command batch if its final command is invalid', () => {
    const { repository } = openRepository();
    const result = repository.apply(
      [
        { kind: 'setting.set', key: 'theme', value: 'dark' },
        {
          kind: 'column.create',
          column: {
            id: 'custom',
            name: 'Custom',
            description: 'Custom state',
            state: 'todo',
            builtIn: false,
          },
        },
        { kind: 'task.move', id: 'missing', columnId: 'custom' },
      ],
      0,
    );
    expect(result.ok).toBe(false);
    const snapshot = repository.load();
    expect(snapshot.revision).toBe(0);
    expect(snapshot.columns.map(({ id }) => id)).not.toContain('custom');
    expect(snapshot.settings).toEqual({ workdays: [1, 2, 3, 4, 5] });
    repository.close();
  });

  it('requires a target to delete a non-empty column and moves its tasks when supplied', () => {
    const { repository } = openRepository();
    const task = {
      id: 'task-1',
      title: 'Task',
      status: { kind: 'todo' as const },
      columnId: 'custom',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 1,
    };
    repository.apply(
      [
        {
          kind: 'column.create',
          column: {
            id: 'custom',
            name: 'Custom',
            description: 'Custom state',
            state: 'todo',
            builtIn: false,
          },
        },
      ],
      0,
    );
    repository.apply([{ kind: 'task.create', task }], 1);
    expect(
      repository.apply([{ kind: 'column.delete', id: 'custom' }], 2).ok,
    ).toBe(false);
    expect(
      repository.apply(
        [{ kind: 'column.delete', id: 'custom', targetColumnId: 'doing' }],
        2,
      ),
    ).toEqual({ ok: true, value: { revision: 3 } });
    expect(repository.load().tasks.map(({ columnId }) => columnId)).toEqual([
      'doing',
    ]);
    repository.close();
  });

  it('rejects a database newer than the known migrations without changing it', () => {
    const { repository, path } = openRepository();
    repository.close();
    const database = new Database(path);
    database.pragma('user_version = 999');
    database.close();
    const before = readFileSync(path);
    expect(() => new Repository(path, clock)).toThrow(/newer/i);
    expect(readFileSync(path)).toEqual(before);
  });

  it('backs up a non-empty WAL database before migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-storage-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database.pragma('journal_mode = WAL');
    database.exec(
      "CREATE TABLE legacy_data (value TEXT); INSERT INTO legacy_data VALUES ('preserved')",
    );
    const backup = `${path}.bak-v0`;
    const migrated = new Repository(path, clock);
    database.close();
    const backupDatabase = new Database(backup);
    expect(
      backupDatabase.prepare('SELECT value FROM legacy_data').get(),
    ).toEqual({ value: 'preserved' });
    expect(readFileSync(backup).byteLength).toBeGreaterThan(0);
    backupDatabase.close();
    migrated.close();
  });

  it('rejects a subtask for a task that does not exist', () => {
    const { repository } = openRepository();
    expect(
      repository.apply(
        [
          {
            kind: 'subtask.add',
            taskId: 'missing',
            subtask: { id: 'sub-1', title: 'Check', completed: false },
          },
        ],
        0,
      ).ok,
    ).toBe(false);
    repository.close();
  });

  it('does not complete a parent when its last subtask is completed', () => {
    const { repository } = openRepository();
    const task = {
      id: 'task-1',
      title: 'Task',
      status: { kind: 'doing' as const },
      columnId: 'doing',
      subtasks: [{ id: 'sub-1', title: 'One', completed: false }],
      comments: [],
      attachments: [],
      addedOrder: 1,
    };
    repository.apply([{ kind: 'task.create', task }], 0);
    repository.apply(
      [
        {
          kind: 'subtask.complete',
          taskId: 'task-1',
          subtaskId: 'sub-1',
          completed: true,
        },
      ],
      1,
    );
    expect(repository.load().tasks[0]?.status).toEqual({ kind: 'doing' });
    repository.close();
  });

  it('persists non-empty workday settings and rejects an empty set', () => {
    const { repository } = openRepository();
    expect(
      repository.apply([{ kind: 'setting.set', key: 'workdays', value: [] }], 0)
        .ok,
    ).toBe(false);
    expect(
      repository.apply(
        [{ kind: 'setting.set', key: 'workdays', value: [1, 3, 5] }],
        0,
      ).ok,
    ).toBe(true);
    expect(repository.load().settings.workdays).toEqual([1, 3, 5]);
    repository.close();
  });

  it('loads and updates one of 1000 persisted tasks', () => {
    const { repository } = openRepository();
    const tasks = Array.from({ length: 1000 }, (_, index) => ({
      id: `task-${String(index)}`,
      title: `Task ${String(index)}`,
      status: { kind: 'todo' as const },
      columnId: 'todo',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: index,
    }));
    const created = repository.apply(
      tasks.map((task) => ({ kind: 'task.create' as const, task })),
      0,
    );
    expect(created.ok).toBe(true);
    const start = performance.now();
    expect(repository.load().tasks).toHaveLength(1000);
    expect(
      repository.apply(
        [{ kind: 'task.update', id: 'task-0', changes: { title: 'Updated' } }],
        1,
      ).ok,
    ).toBe(true);
    expect(performance.now() - start).toBeLessThan(5000);
    repository.close();
  });
});
