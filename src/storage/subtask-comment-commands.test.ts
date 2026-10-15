import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './repository';
import type { Clock, StorageCommand } from './types';
import { ipcCommandSchema } from '../shared/command-schema';

const directories: string[] = [];
const baseTime = Temporal.Instant.from('2026-10-05T12:00:00Z');

function controllableClock(): Clock & { set(now: Temporal.Instant): void } {
  let current = baseTime;
  return {
    now: () => current,
    set: (next) => {
      current = next;
    },
  };
}

function openRepository(clock: Clock = controllableClock()): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-subtasks-'));
  directories.push(directory);
  return new Repository(join(directory, 'tasks.sqlite'), clock);
}

function createTaskWithSubtasks(
  repository: Repository,
  subtasks: readonly { id: string; title: string; completed: boolean }[],
): number {
  const result = repository.apply(
    [
      {
        kind: 'task.create',
        task: {
          id: 'task-1',
          title: 'Задача',
          status: { kind: 'todo' },
          columnId: 'todo',
          subtasks,
          comments: [],
          attachments: [],
          addedOrder: 1,
        },
      },
    ],
    0,
  );
  if (!result.ok) throw new Error('task.create failed');
  return result.value.revision;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('subtask.rename', () => {
  it('renames the subtask and records history with the user source', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Шаг', completed: false },
    ]);
    expect(
      repository.apply(
        [
          {
            kind: 'subtask.rename',
            taskId: 'task-1',
            subtaskId: 'sub-1',
            title: 'Новый шаг',
          },
        ],
        1,
      ),
    ).toEqual({ ok: true, value: { revision: 2 } });
    const task = repository.load().tasks[0];
    expect(task?.subtasks).toEqual([
      { id: 'sub-1', title: 'Новый шаг', completed: false, position: 0 },
    ]);
    expect(repository.history(1).entries[0]?.source).toBe('user');
    repository.close();
  });

  it('rejects an empty title without applying the command', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Шаг', completed: false },
    ]);
    const before = repository.load();
    const result = repository.apply(
      [
        {
          kind: 'subtask.rename',
          taskId: 'task-1',
          subtaskId: 'sub-1',
          title: '   ',
        },
      ],
      1,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('InvalidCommand');
    expect(repository.load()).toEqual(before);
    repository.close();
  });

  it('rejects a title longer than the limit without applying the command', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Шаг', completed: false },
    ]);
    const before = repository.load();
    const result = repository.apply(
      [
        {
          kind: 'subtask.rename',
          taskId: 'task-1',
          subtaskId: 'sub-1',
          title: 'а'.repeat(201),
        },
      ],
      1,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('InvalidCommand');
    expect(repository.load()).toEqual(before);
    repository.close();
  });

  it('reports an unknown subtask without changing stored data', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Шаг', completed: false },
    ]);
    const before = repository.load();
    const result = repository.apply(
      [
        {
          kind: 'subtask.rename',
          taskId: 'task-1',
          subtaskId: 'missing',
          title: 'Новый шаг',
        },
      ],
      1,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'InvalidCommand', message: 'subtask-not-found' },
    });
    expect(repository.load()).toEqual(before);
    repository.close();
  });
});

describe('subtask.remove', () => {
  it('allows removing the last subtask and undo restores it in place', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Шаг', completed: false },
    ]);
    expect(
      repository.apply(
        [{ kind: 'subtask.remove', taskId: 'task-1', subtaskId: 'sub-1' }],
        1,
      ),
    ).toEqual({ ok: true, value: { revision: 2 } });
    expect(repository.load().tasks[0]?.subtasks).toEqual([]);
    const undo = repository.undo();
    expect(undo.ok).toBe(true);
    expect(repository.load().tasks[0]?.subtasks).toEqual([
      { id: 'sub-1', title: 'Шаг', completed: false, position: 0 },
    ]);
    repository.close();
  });

  it('renumbers remaining subtasks and undo restores the exact order', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Один', completed: false },
      { id: 'sub-2', title: 'Два', completed: true },
      { id: 'sub-3', title: 'Три', completed: false },
    ]);
    expect(
      repository.apply(
        [{ kind: 'subtask.remove', taskId: 'task-1', subtaskId: 'sub-1' }],
        1,
      ),
    ).toEqual({ ok: true, value: { revision: 2 } });
    expect(repository.load().tasks[0]?.subtasks).toEqual([
      { id: 'sub-2', title: 'Два', completed: true, position: 0 },
      { id: 'sub-3', title: 'Три', completed: false, position: 1 },
    ]);
    expect(repository.undo().ok).toBe(true);
    expect(repository.load().tasks[0]?.subtasks).toEqual([
      { id: 'sub-1', title: 'Один', completed: false, position: 0 },
      { id: 'sub-2', title: 'Два', completed: true, position: 1 },
      { id: 'sub-3', title: 'Три', completed: false, position: 2 },
    ]);
    repository.close();
  });
});

describe('subtask.move', () => {
  it('moves a subtask to the start and undo restores the order', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Один', completed: false },
      { id: 'sub-2', title: 'Два', completed: false },
      { id: 'sub-3', title: 'Три', completed: false },
    ]);
    expect(
      repository.apply(
        [
          {
            kind: 'subtask.move',
            taskId: 'task-1',
            subtaskId: 'sub-3',
            position: 0,
          },
        ],
        1,
      ),
    ).toEqual({ ok: true, value: { revision: 2 } });
    expect(repository.load().tasks[0]?.subtasks.map(({ id }) => id)).toEqual([
      'sub-3',
      'sub-1',
      'sub-2',
    ]);
    expect(repository.undo().ok).toBe(true);
    expect(repository.load().tasks[0]?.subtasks).toEqual([
      { id: 'sub-1', title: 'Один', completed: false, position: 0 },
      { id: 'sub-2', title: 'Два', completed: false, position: 1 },
      { id: 'sub-3', title: 'Три', completed: false, position: 2 },
    ]);
    repository.close();
  });

  it('moves a subtask to the end', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Один', completed: false },
      { id: 'sub-2', title: 'Два', completed: false },
    ]);
    expect(
      repository.apply(
        [
          {
            kind: 'subtask.move',
            taskId: 'task-1',
            subtaskId: 'sub-1',
            position: 1,
          },
        ],
        1,
      ),
    ).toEqual({ ok: true, value: { revision: 2 } });
    expect(repository.load().tasks[0]?.subtasks.map(({ id }) => id)).toEqual([
      'sub-2',
      'sub-1',
    ]);
    repository.close();
  });

  it('does not change task or history when moving to the current position', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Один', completed: false },
      { id: 'sub-2', title: 'Два', completed: false },
    ]);
    const before = repository.load();
    const historyBefore = repository.history(10);

    expect(
      repository.apply(
        [
          {
            kind: 'subtask.move',
            taskId: 'task-1',
            subtaskId: 'sub-1',
            position: 0,
          },
        ],
        1,
      ),
    ).toEqual({ ok: true, value: { revision: 1 } });
    expect(repository.load()).toEqual(before);
    expect(repository.history(10)).toEqual(historyBefore);
    repository.close();
  });

  it('rejects a position outside the list without changing stored data', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Один', completed: false },
      { id: 'sub-2', title: 'Два', completed: false },
    ]);
    const before = repository.load();
    const result = repository.apply(
      [
        {
          kind: 'subtask.move',
          taskId: 'task-1',
          subtaskId: 'sub-1',
          position: 2,
        },
      ],
      1,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'InvalidCommand',
        message: 'subtask-position-out-of-range',
      },
    });
    expect(repository.load()).toEqual(before);
    repository.close();
  });
});

describe('subtask.add', () => {
  it('rejects a duplicate subtask id without changing stored data', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Один', completed: false },
    ]);
    const before = repository.load();
    const result = repository.apply(
      [
        {
          kind: 'subtask.add',
          taskId: 'task-1',
          subtask: { id: 'sub-1', title: 'Повтор', completed: false },
        },
      ],
      1,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'InvalidCommand', message: 'duplicate-subtask-id' },
    });
    expect(repository.load()).toEqual(before);
    repository.close();
  });
});

describe('comment.add', () => {
  it('stamps the creation time from the application clock', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, []);
    expect(
      repository.apply(
        [
          {
            kind: 'comment.add',
            taskId: 'task-1',
            comment: { id: 'comment-1', text: 'Заметка' },
          },
        ],
        1,
      ),
    ).toEqual({ ok: true, value: { revision: 2 } });
    expect(repository.load().tasks[0]?.comments).toEqual([
      { id: 'comment-1', text: 'Заметка', createdAt: baseTime },
    ]);
    repository.close();
  });

  it('orders consecutive comments by the application clock', () => {
    const clock = controllableClock();
    const repository = openRepository(clock);
    createTaskWithSubtasks(repository, []);
    for (const [index, id] of ['comment-1', 'comment-2'].entries()) {
      clock.set(baseTime.add({ minutes: index }));
      const revision = repository.load().revision;
      const result = repository.apply(
        [
          {
            kind: 'comment.add',
            taskId: 'task-1',
            comment: { id, text: `Заметка ${id}` },
          },
        ],
        revision,
      );
      expect(result.ok).toBe(true);
    }
    const comments = repository.load().tasks[0]?.comments ?? [];
    expect(comments.map(({ id }) => id)).toEqual(['comment-1', 'comment-2']);
    expect(comments).toHaveLength(2);
    const [first, second] = comments;
    if (!first || !second) throw new Error('expected two comments');
    expect(
      Temporal.Instant.compare(
        first.createdAt ?? baseTime,
        second.createdAt ?? baseTime,
      ),
    ).toBeLessThan(0);
    repository.close();
  });

  it('rejects a comment payload that carries a creation time', () => {
    const command = {
      kind: 'comment.add',
      taskId: 'task-1',
      comment: {
        id: 'comment-1',
        text: 'Заметка',
        createdAt: '2020-01-01T00:00:00Z',
      },
    } as unknown as StorageCommand;
    expect(ipcCommandSchema.safeParse(command).success).toBe(false);
    const repository = openRepository();
    createTaskWithSubtasks(repository, []);
    const before = repository.load();
    expect(repository.apply([command], 1).ok).toBe(false);
    expect(repository.load()).toEqual(before);
    repository.close();
  });

  it('reads a legacy comment row without time as createdAt null', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, []);
    const directory = directories.at(-1);
    if (!directory) throw new Error('missing test directory');
    repository.close();
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database
      .prepare(
        'INSERT INTO comments(id,task_id,text,created_at,position) VALUES(?,?,?,?,?)',
      )
      .run('legacy-comment', 'task-1', 'Старая заметка', null, 0);
    database.close();
    const reopened = new Repository(path, controllableClock());
    expect(reopened.load().tasks[0]?.comments).toEqual([
      { id: 'legacy-comment', text: 'Старая заметка', createdAt: null },
    ]);
    reopened.close();
  });
});

describe('subtask command concurrency', () => {
  it('rejects a subtask command with a stale revision', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Шаг', completed: false },
    ]);
    const result = repository.apply(
      [
        {
          kind: 'subtask.rename',
          taskId: 'task-1',
          subtaskId: 'sub-1',
          title: 'Другой шаг',
        },
      ],
      5,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'StaleRevision', expected: 5, actual: 1 },
    });
    expect(repository.load().tasks[0]?.subtasks[0]?.title).toBe('Шаг');
    repository.close();
  });

  it('records ai as the history source for ai subtask commands', () => {
    const repository = openRepository();
    createTaskWithSubtasks(repository, [
      { id: 'sub-1', title: 'Шаг', completed: false },
    ]);
    expect(
      repository.apply(
        [
          {
            kind: 'subtask.rename',
            taskId: 'task-1',
            subtaskId: 'sub-1',
            title: 'Новый шаг',
          },
        ],
        1,
        { source: 'ai' },
      ).ok,
    ).toBe(true);
    expect(repository.history(1).entries[0]?.source).toBe('ai');
    repository.close();
  });
});
