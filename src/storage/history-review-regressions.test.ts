import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-history-review-'));
  directories.push(directory);
  return new Repository(join(directory, 'tasks.sqlite'), clock);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('history review regressions', () => {
  it('detects column changes even after its values return to the original state', () => {
    const repository = openRepository();
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
    const creation = repository
      .history(10)
      .entries.find(({ revision }) => revision === 1);
    if (!creation) throw new Error('Expected column creation history');
    repository.apply(
      [
        {
          kind: 'task.create',
          task: {
            id: 'task-1',
            title: 'Keep this task',
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
    repository.apply(
      [
        {
          kind: 'column.rename',
          id: 'custom',
          name: 'Renamed',
          description: '',
        },
      ],
      2,
    );
    repository.apply(
      [
        {
          kind: 'column.rename',
          id: 'custom',
          name: 'Custom',
          description: '',
        },
      ],
      3,
    );

    expect(repository.undo(creation.id)).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(
      repository.load().columns.find(({ id }) => id === 'custom')?.name,
    ).toBe('Custom');
    expect(repository.load().tasks).toMatchObject([
      { id: 'task-1', title: 'Keep this task', columnId: 'custom' },
    ]);
    repository.close();
  });

  it('detects setting changes after its value returns to the original state', () => {
    const repository = openRepository();
    repository.apply(
      [{ kind: 'setting.set', key: 'workdays', value: [1, 2, 3] }],
      0,
    );
    const initialChange = repository.history(10).entries[0];
    if (!initialChange) throw new Error('Expected setting history');
    repository.apply(
      [{ kind: 'setting.set', key: 'workdays', value: [1, 2] }],
      1,
    );
    repository.apply(
      [{ kind: 'setting.set', key: 'workdays', value: [1, 2, 3] }],
      2,
    );

    expect(repository.undo(initialChange.id)).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(repository.load().settings).toEqual({
      aiMode: 'auto',
      workdays: [1, 2, 3],
    });
    repository.close();
  });

  it('rejects task creation with attachment metadata without writing data', () => {
    const repository = openRepository();
    const result = repository.apply(
      [
        {
          kind: 'task.create',
          task: {
            id: 'task-1',
            title: 'No staged file',
            status: { kind: 'todo' },
            columnId: 'todo',
            subtasks: [],
            comments: [],
            attachments: [
              {
                id: 'file-1',
                name: 'notes.txt',
                mediaType: 'text/plain',
                sizeBytes: 5,
              },
            ],
            addedOrder: 1,
          },
        },
      ],
      0,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'InvalidCommand' },
    });
    expect(repository.load().revision).toBe(0);
    expect(repository.load().tasks).toEqual([]);
    expect(repository.history(10).entries).toEqual([]);
    repository.close();
  });
});
