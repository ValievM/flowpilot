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

  it('moves ordinary tasks into waiting columns with a reason', () => {
    const repository = openRepository();
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
            description: '',
            state: 'todo',
            builtIn: false,
          },
        },
      ],
      0,
    );
    repository.apply([{ kind: 'task.create', task }], 1);
    const result = repository.apply(
      [
        {
          kind: 'column.delete',
          id: 'custom',
          targetColumnId: 'waiting',
          waiting: { reason: 'Ждёт ответа' },
        },
      ],
      2,
    );

    expect(result.ok).toBe(true);
    const movedTask = repository.load().tasks[0];
    expect(movedTask).toBeDefined();
    if (!movedTask) throw new Error('task was not moved');
    expect(movedTask.columnId).toBe('waiting');
    expect(movedTask.status.kind).toBe('waiting');
    if (movedTask.status.kind === 'waiting')
      expect(movedTask.status.reason).toBe('Ждёт ответа');
    repository.close();
  });
});
