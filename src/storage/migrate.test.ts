import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import initialSchema from './migrations/0001_init.sql?raw';
import { migrate } from './migrate';
import { Temporal } from 'temporal-polyfill';
import attachmentIntegrity from './migrations/0002_attachment_integrity.sql?raw';
import historySchema from './migrations/0003_change_log.sql?raw';
import entityVersions from './migrations/0004_entity_versions.sql?raw';
import { Repository } from './repository';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('database migrations', () => {
  it('adds attachment integrity and change history when upgrading a version-one database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-storage-v1-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database.exec(initialSchema);
    database.pragma('user_version = 1');
    migrate(database, path);
    const columns = database
      .prepare('PRAGMA table_info(attachments)')
      .all() as { name: string }[];
    expect(columns.map(({ name }) => name)).toContain('created_at');
    expect(
      (
        database.prepare('PRAGMA table_info(columns)').all() as {
          name: string;
        }[]
      ).map(({ name }) => name),
    ).toContain('version');
    expect(
      (
        database.prepare('PRAGMA table_info(settings)').all() as {
          name: string;
        }[]
      ).map(({ name }) => name),
    ).toContain('version');
    expect(database.pragma('user_version')).toEqual([{ user_version: 9 }]);
    expect(
      database
        .prepare("SELECT generation FROM column_generations WHERE id = 'todo'")
        .get(),
    ).toEqual({ generation: 1 });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='change_log'",
        )
        .get(),
    ).toEqual({ name: 'change_log' });
    database.close();
  });
  it('preserves legacy applied operations while adding replay details', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-storage-v8-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database.exec(`
      CREATE TABLE applied_operations (
        operation_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL UNIQUE,
        revision INTEGER NOT NULL
      );
    `);
    database
      .prepare(
        'INSERT INTO applied_operations(operation_id,proposal_id,revision) VALUES(?,?,?)',
      )
      .run('existing-operation', 'existing-proposal', 4);
    database.pragma('user_version = 8');

    migrate(database, path);

    expect(database.pragma('user_version')).toEqual([{ user_version: 9 }]);
    expect(
      database
        .prepare(
          'SELECT operation_id,proposal_id,revision,rejected_commands_json FROM applied_operations',
        )
        .get(),
    ).toEqual({
      operation_id: 'existing-operation',
      proposal_id: 'existing-proposal',
      revision: 4,
      rejected_commands_json: null,
    });
    database.close();
  });
  it('preserves generations for deleted columns when upgrading version four', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-storage-v4-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database.exec(initialSchema);
    database.exec(attachmentIntegrity);
    database.exec(historySchema);
    database.exec(entityVersions);
    database.pragma('user_version = 4');
    database
      .prepare(
        'INSERT INTO columns(id,name,description,state,built_in,position,version) VALUES(?,?,?,?,?,?,?)',
      )
      .run('custom', 'Custom', '', 'todo', 0, 4, 1);
    database
      .prepare(
        'INSERT INTO change_log(id,revision,occurred_at,source,batch_id) VALUES(?,?,?,?,?)',
      )
      .run('old-create', 1, '2026-10-05T12:00:00Z', 'user', 'batch-1');
    database
      .prepare(
        'INSERT INTO change_log_entities(entry_id,entity_kind,entity_id,state_before_json,state_after_json,version_after) VALUES(?,?,?,?,?,?)',
      )
      .run(
        'old-create',
        'column',
        'custom',
        null,
        JSON.stringify({
          id: 'custom',
          name: 'Custom',
          description: '',
          state: 'todo',
          built_in: 0,
          position: 4,
          version: 1,
        }),
        1,
      );
    database.prepare('DELETE FROM columns WHERE id = ?').run('custom');
    database
      .prepare('UPDATE metadata SET revision = 1 WHERE singleton = 1')
      .run();
    migrate(database, path);
    database.close();

    const repository = new Repository(path, {
      now: () => Temporal.Instant.from('2026-10-05T12:00:00Z'),
    });
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
      1,
    );

    expect(repository.undo('old-create')).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(repository.load().columns).toContainEqual(
      expect.objectContaining({ id: 'custom', name: 'Custom' }),
    );
    repository.close();
  });
  it('undoes a deleted column after upgrading a version-four database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-storage-v4-undo-'));
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database.exec(initialSchema);
    database.exec(attachmentIntegrity);
    database.exec(historySchema);
    database.exec(entityVersions);
    database.pragma('user_version = 4');
    database
      .prepare(
        'INSERT INTO change_log(id,revision,occurred_at,source,batch_id) VALUES(?,?,?,?,?)',
      )
      .run('create', 1, '2026-10-05T12:00:00Z', 'user', 'batch-1');
    database
      .prepare(
        'INSERT INTO change_log_entities(entry_id,entity_kind,entity_id,state_before_json,state_after_json,version_after) VALUES(?,?,?,?,?,?)',
      )
      .run(
        'create',
        'column',
        'custom',
        null,
        JSON.stringify({
          id: 'custom',
          name: 'Custom',
          description: '',
          state: 'todo',
          built_in: 0,
          position: 4,
          version: 1,
        }),
        1,
      );
    database
      .prepare(
        'INSERT INTO change_log(id,revision,occurred_at,source,batch_id) VALUES(?,?,?,?,?)',
      )
      .run('delete', 2, '2026-10-05T12:00:00Z', 'user', 'batch-2');
    database
      .prepare(
        'INSERT INTO change_log_entities(entry_id,entity_kind,entity_id,state_before_json,state_after_json,version_after) VALUES(?,?,?,?,?,?)',
      )
      .run(
        'delete',
        'column',
        'custom',
        JSON.stringify({
          id: 'custom',
          name: 'Custom',
          description: '',
          state: 'todo',
          built_in: 0,
          position: 4,
          version: 1,
        }),
        null,
        null,
      );
    database
      .prepare('UPDATE metadata SET revision = 2 WHERE singleton = 1')
      .run();
    migrate(database, path);
    database.close();

    const repository = new Repository(path, {
      now: () => Temporal.Instant.from('2026-10-05T12:00:00Z'),
    });

    expect(repository.undo('delete')).toMatchObject({
      ok: true,
      value: { revision: 3 },
    });
    expect(repository.load().columns).toContainEqual(
      expect.objectContaining({ id: 'custom', name: 'Custom' }),
    );
    repository.close();
  });

  it('rejects a database without a FlowPilot version without changing it', () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'flowpilot-foreign-database-'),
    );
    directories.push(directory);
    const path = join(directory, 'tasks.sqlite');
    const database = new Database(path);
    database.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY)');
    database.close();
    const before = createHash('sha256')
      .update(readFileSync(path))
      .digest('hex');

    expect(
      () => new Repository(path, { now: () => Temporal.Now.instant() }),
    ).toThrow('Foreign database schema is not supported');

    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(
      before,
    );
  });
});
