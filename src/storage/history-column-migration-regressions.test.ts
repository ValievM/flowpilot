import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import attachmentIntegrity from './migrations/0002_attachment_integrity.sql?raw';
import historySchema from './migrations/0003_change_log.sql?raw';
import entityVersions from './migrations/0004_entity_versions.sql?raw';
import initialSchema from './migrations/0001_init.sql?raw';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T12:00:00Z') };
const column = {
  id: 'reused',
  name: 'Legacy',
  description: '',
  state: 'todo',
  built_in: 0,
  position: 100,
  version: 1,
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('column migration undo regressions', () => {
  it('distinguishes reused v4 tombstones after upgrade', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-v4-column-reuse-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database.exec(initialSchema);
    database.exec(attachmentIntegrity);
    database.exec(historySchema);
    database.exec(entityVersions);
    database.pragma('user_version = 4');
    addColumnLifecycle(database, 'create-1', 'delete-1', 1);
    addColumnLifecycle(database, 'create-2', 'delete-2', 3);
    database
      .prepare('UPDATE metadata SET revision = 4 WHERE singleton = 1')
      .run();
    database.close();

    const repository = new Repository(path, clock);
    const initialHistory = repository.history(10).entries;
    expect(repository.load().revision).toBe(4);
    expect(repository.load().columns).not.toContainEqual(
      expect.objectContaining({ id: column.id }),
    );

    expect(repository.undo('delete-1')).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(repository.load().revision).toBe(4);
    expect(repository.load().columns).not.toContainEqual(
      expect.objectContaining({ id: column.id }),
    );
    expect(repository.history(10).entries).toEqual(initialHistory);

    expect(repository.undo('delete-2')).toEqual({
      ok: true,
      value: { revision: 5 },
    });
    expect(repository.load().columns).toContainEqual(
      expect.objectContaining({ id: column.id, name: column.name }),
    );
    expect(repository.undo('delete-2')).toMatchObject({
      ok: false,
      error: { kind: 'AlreadyUndone' },
    });
    expect(repository.undo('delete-1')).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    repository.close();
  });
});

function addColumnLifecycle(
  database: Database.Database,
  createId: string,
  deleteId: string,
  revision: number,
): void {
  database
    .prepare(
      'INSERT INTO columns(id,name,description,state,built_in,position,version) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      column.id,
      column.name,
      column.description,
      column.state,
      column.built_in,
      column.position,
      column.version,
    );
  addHistoryEntity(database, createId, revision, {
    before: null,
    after: column,
  });
  addHistoryEntity(database, deleteId, revision + 1, {
    before: column,
    after: null,
  });
  database.prepare('DELETE FROM columns WHERE id = ?').run(column.id);
}

function addHistoryEntity(
  database: Database.Database,
  entryId: string,
  revision: number,
  states: { before: typeof column | null; after: typeof column | null },
): void {
  database
    .prepare(
      'INSERT INTO change_log(id,revision,occurred_at,source,batch_id) VALUES(?,?,?,?,?)',
    )
    .run(entryId, revision, '2026-10-06T12:00:00Z', 'user', entryId);
  database
    .prepare(
      'INSERT INTO change_log_entities(entry_id,entity_kind,entity_id,state_before_json,state_after_json,version_after) VALUES(?,?,?,?,?,?)',
    )
    .run(
      entryId,
      'column',
      column.id,
      states.before ? JSON.stringify(states.before) : null,
      states.after ? JSON.stringify(states.after) : null,
      states.after?.version ?? null,
    );
}
