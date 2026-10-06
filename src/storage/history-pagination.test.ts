import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): Repository {
  const directory = mkdtempSync(
    join(tmpdir(), 'flowpilot-history-pagination-'),
  );
  directories.push(directory);
  return new Repository(join(directory, 'tasks.sqlite'), clock);
}

function task(id: string, title: string) {
  return {
    id,
    title,
    status: { kind: 'todo' as const },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Repository history pagination', () => {
  it('keeps pages bounded for negative, zero, and positive limits', () => {
    const repository = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-1', 'A') }], 0);
    repository.apply([{ kind: 'task.create', task: task('task-2', 'B') }], 1);
    repository.apply([{ kind: 'task.create', task: task('task-3', 'C') }], 2);
    const newest = repository.history(1).entries[0];
    if (!newest) throw new Error('Expected newest history entry');

    expect(repository.history(-1).entries).toEqual([]);
    expect(repository.history(-1, newest.id).entries).toEqual([]);
    expect(repository.history(0).entries).toEqual([]);
    expect(repository.history(0, newest.id).entries).toEqual([]);
    expect(repository.history(1).entries).toMatchObject([
      { revision: 3, entities: [{ id: 'task-3' }] },
    ]);
    expect(repository.history(1, newest.id).entries).toMatchObject([
      { revision: 2, entities: [{ id: 'task-2' }] },
    ]);
    expect(repository.history(10).entries).toHaveLength(3);
    repository.close();
  });
});
