import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './index';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-review-'));
  directories.push(directory);
  return new Repository(join(directory, 'tasks.sqlite'), clock);
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('review regressions', () => {
  it('clears optional deadline and estimate with null updates', () => {
    const repository = openRepository();
    const task = {
      id: 'task-1',
      title: 'Task',
      status: { kind: 'todo' as const },
      columnId: 'todo',
      deadline: Temporal.PlainDate.from('2026-10-09'),
      estimate: { unit: 'workdays' as const, value: 3 },
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 1,
    };
    repository.apply([{ kind: 'task.create', task }], 0);
    const result = repository.apply(
      [
        {
          kind: 'task.update',
          id: task.id,
          changes: { deadline: null, estimate: null },
        },
      ],
      1,
    );

    expect(result.ok).toBe(true);
    expect(repository.load().tasks[0]).toMatchObject({
      id: task.id,
      title: task.title,
    });
    expect(repository.load().tasks[0]).not.toHaveProperty('deadline');
    expect(repository.load().tasks[0]).not.toHaveProperty('estimate');
    repository.close();
  });

  it.each([undefined, '2026-10-08'])(
    'persists waiting reason and optional deadline when deleting a column %#',
    (until) => {
      const repository = openRepository();
      addCustomTask(repository);
      const waiting = {
        reason: 'Жду ответа',
        ...(until ? { until: Temporal.PlainDate.from(until) } : {}),
      };
      const result = repository.apply(
        [
          {
            kind: 'column.delete',
            id: 'custom',
            targetColumnId: 'waiting',
            waiting,
          },
        ],
        2,
      );

      expect(result).toEqual({ ok: true, value: { revision: 3 } });
      const updated = repository.load();
      expect(updated.columns.some(({ id }) => id === 'custom')).toBe(false);
      const movedTask = updated.tasks[0];
      expect(movedTask).toBeDefined();
      if (!movedTask) throw new Error('task was not moved');
      expect(movedTask.columnId).toBe('waiting');
      expect(movedTask.status).toEqual({
        kind: 'waiting',
        reason: waiting.reason,
        ...(until ? { until: Temporal.PlainDate.from(until) } : {}),
      });
      repository.close();
    },
  );

  it('rejects deleting into waiting without a reason before mutation', () => {
    const repository = openRepository();
    addCustomTask(repository);
    const before = repository.load();

    expect(
      repository.apply(
        [
          {
            kind: 'column.delete',
            id: 'custom',
            targetColumnId: 'waiting',
          },
        ],
        2,
      ),
    ).toEqual({
      ok: false,
      error: { kind: 'InvalidCommand', message: 'waiting-reason-required' },
    });
    expect(repository.load()).toEqual(before);
    repository.close();
  });
});

function addCustomTask(repository: Repository): void {
  repository.apply(
    [
      {
        kind: 'column.create',
        column: {
          id: 'custom',
          name: 'Custom',
          description: '',
          state: 'todo',
          builtIn: false,
        },
      },
    ],
    0,
  );
  repository.apply(
    [
      {
        kind: 'task.create',
        task: {
          id: 'task-1',
          title: 'Task',
          status: { kind: 'todo' },
          columnId: 'custom',
          subtasks: [],
          comments: [],
          attachments: [],
          addedOrder: 1,
        },
      },
    ],
    1,
  );
}
