import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import initialSchema from './migrations/0001_init.sql?raw';
import { migrate } from './migrate';

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
    expect(columns.map(({ name }) => name)).toContain('sha256');
    expect(columns.map(({ name }) => name)).toContain('created_at');
    expect(database.pragma('user_version')).toEqual([{ user_version: 3 }]);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='change_log'",
        )
        .get(),
    ).toEqual({ name: 'change_log' });
    database.close();
  });
});
