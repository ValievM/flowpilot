import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function openRepository(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-column-undo-'));
  directories.push(directory);
  return new Repository(join(directory, 'tasks.sqlite'), clock);
}

function createColumn(repository: Repository, id: string, revision: number) {
  return repository.apply(
    [
      {
        kind: 'column.create',
        column: {
          id,
          name: id,
          description: '',
          state: 'todo',
          builtIn: false,
        },
      },
    ],
    revision,
  );
}

function createTask(
  repository: Repository,
  revision: number,
  columnId: string,
) {
  return repository.apply(
    [
      {
        kind: 'task.create',
        task: {
          id: 'task-1',
          title: 'Keep this task',
          status: { kind: 'todo' },
          columnId,
          subtasks: [],
          comments: [],
          attachments: [],
          addedOrder: 1,
        },
      },
    ],
    revision,
  );
}

describe('column undo regressions', () => {
  it('undoes a legacy v5 column deletion after reopening the database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-column-undo-v5-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    let repository = new Repository(path, clock);
    createColumn(repository, 'custom', 0);
    repository.apply([{ kind: 'column.delete', id: 'custom' }], 1);
    const deletion = repository
      .history(10)
      .entries.find(({ revision }) => revision === 2);
    if (!deletion) throw new Error('Expected column deletion history');
    repository.close();

    const legacyDatabase = new Database(path);
    legacyDatabase
      .prepare(
        "UPDATE change_log_entities SET version_after = NULL WHERE entry_id = ? AND entity_kind = 'column'",
      )
      .run(deletion.id);
    legacyDatabase.exec(
      'ALTER TABLE tasks DROP COLUMN ai_rank; DROP TABLE applied_operations;',
    );
    legacyDatabase.exec(`
      DROP INDEX tasks_type_id;
      DROP INDEX tasks_discipline_id;
      ALTER TABLE tasks DROP COLUMN type_id;
      ALTER TABLE tasks DROP COLUMN discipline_id;
      DROP TABLE rule_versions;
      DROP TABLE rule_documents;
      DROP TABLE task_types;
      DROP TABLE disciplines;
      DROP TABLE series_outcomes;
      DROP TABLE series;
      DROP TABLE schedule_events;
      DROP TABLE schedule_snapshots;
      DROP TABLE reminder_ledger;
    `);
    legacyDatabase.pragma('user_version = 5');
    legacyDatabase.close();

    repository = new Repository(path, clock);
    expect(repository.undo(deletion.id)).toEqual({
      ok: true,
      value: { revision: 3 },
    });
    expect(repository.load().columns).toContainEqual(
      expect.objectContaining({ id: 'custom', name: 'custom' }),
    );
    repository.close();
  });

  it('distinguishes tombstones after deleting a reused column id', () => {
    const repository = openRepository();
    createColumn(repository, 'custom', 0);
    repository.apply([{ kind: 'column.delete', id: 'custom' }], 1);
    createColumn(repository, 'custom', 2);
    repository.apply([{ kind: 'column.delete', id: 'custom' }], 3);
    const firstDeletion = repository
      .history(10)
      .entries.find(({ revision }) => revision === 2);
    if (!firstDeletion) throw new Error('Expected first deletion history');

    expect(repository.undo(firstDeletion.id)).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(repository.load().revision).toBe(4);
    expect(repository.load().columns).not.toContainEqual(
      expect.objectContaining({ id: 'custom' }),
    );
    expect(repository.history(10).entries).toHaveLength(4);

    expect(repository.undo()).toMatchObject({
      ok: true,
      value: { revision: 5 },
    });
    expect(repository.load().columns).toContainEqual(
      expect.objectContaining({ id: 'custom', name: 'custom' }),
    );
    repository.close();
  });

  it('does not undo an old creation after reusing the same column id', () => {
    const repository = openRepository();
    createColumn(repository, 'custom', 0);
    const creation = repository.history(10).entries[0];
    if (!creation) throw new Error('Expected column creation history');
    repository.apply([{ kind: 'column.delete', id: 'custom' }], 1);
    createColumn(repository, 'custom', 2);

    expect(repository.undo(creation.id)).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(repository.load().columns).toContainEqual(
      expect.objectContaining({ id: 'custom', name: 'custom' }),
    );
    repository.close();
  });

  it('undoes a column rename in place while a task references it', () => {
    const repository = openRepository();
    createColumn(repository, 'custom', 0);
    createTask(repository, 1, 'custom');
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
    const rename = repository
      .history(10)
      .entries.find(({ revision }) => revision === 3);
    if (!rename) throw new Error('Expected column rename history');

    expect(repository.undo(rename.id)).toMatchObject({ ok: true });
    expect(repository.load().columns).toContainEqual(
      expect.objectContaining({ id: 'custom', name: 'custom' }),
    );
    expect(repository.load().tasks).toContainEqual(
      expect.objectContaining({ id: 'task-1', columnId: 'custom' }),
    );
    repository.close();
  });

  it('restores a deleted column when its position has been reused', () => {
    const repository = openRepository();
    createColumn(repository, 'deleted', 0);
    createTask(repository, 1, 'deleted');
    repository.apply(
      [{ kind: 'column.delete', id: 'deleted', targetColumnId: 'todo' }],
      2,
    );
    createColumn(repository, 'replacement', 3);
    const deletion = repository
      .history(10)
      .entries.find(({ revision }) => revision === 3);
    if (!deletion) throw new Error('Expected column deletion history');

    expect(repository.undo(deletion.id)).toMatchObject({ ok: true });
    const { columns, tasks } = repository.load();
    const restored = columns.find(({ id }) => id === 'deleted');
    expect(restored).toEqual(
      expect.objectContaining({ id: 'deleted', name: 'deleted' }),
    );
    expect(tasks).toContainEqual(
      expect.objectContaining({ id: 'task-1', columnId: 'deleted' }),
    );
    repository.close();
  });
  it('reports a conflict when a separately created task references a new column', () => {
    const repository = openRepository();
    createColumn(repository, 'custom', 0);
    const creation = repository.history(10).entries[0];
    if (!creation) throw new Error('Expected column creation history');
    createTask(repository, 1, 'custom');

    expect(repository.undo(creation.id)).toMatchObject({
      ok: false,
      error: {
        kind: 'UndoConflict',
        entities: [{ kind: 'task', id: 'task-1' }],
      },
    });
    const { revision, columns, tasks } = repository.load();
    expect(revision).toBe(2);
    expect(columns).toContainEqual(expect.objectContaining({ id: 'custom' }));
    expect(tasks).toContainEqual(
      expect.objectContaining({ id: 'task-1', columnId: 'custom' }),
    );
    repository.close();
  });
});
