import Database from 'better-sqlite3';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPreviousVersionDatabase,
  LEGACY_ATTACHMENT_HASH,
  legacySnapshot,
} from '../../tests/storage/migration-fixtures/legacy-database';
import {
  latestMigrationVersion,
  migrationFiles,
} from '../../tests/storage/migration-fixtures/migration-files';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };
const upgradeMigrations = migrationFiles.slice(1);

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('upgrading databases with previous-version data', () => {
  it.each(upgradeMigrations)(
    'preserves existing data when applying migration $filename',
    ({ version }) => {
      const previousVersion = version - 1;
      const directory = makeDirectory();
      const path = join(directory, 'tasks.sqlite');
      createPreviousVersionDatabase(path, previousVersion);

      const repository = new Repository(path, clock);
      expect(repository.load()).toEqual(legacySnapshot);
      repository.close();

      const backupPath = `${path}.bak-v${String(previousVersion)}`;
      expect(existsSync(backupPath)).toBe(true);
      expect(
        existsSync(join(directory, 'attachments', 'legacy-attachment')),
      ).toBe(true);
      expectBackupData(backupPath, previousVersion);
      expectMigratedData(path, previousVersion);

      const backupBytes = readFileSync(backupPath);
      const databaseFiles = listBackupFiles(directory);
      const reopened = new Repository(path, clock);
      expect(reopened.load()).toEqual(legacySnapshot);
      reopened.close();

      expect(readFileSync(backupPath)).toEqual(backupBytes);
      expect(listBackupFiles(directory)).toEqual(databaseFiles);
      expectMigratedData(path, previousVersion);
    },
  );

  it.each([latestMigrationVersion + 1, 999])(
    'rejects unsupported database version %s without changing existing data',
    (unsupportedVersion) => {
      const directory = makeDirectory();
      const path = join(directory, 'tasks.sqlite');
      createPreviousVersionDatabase(path, latestMigrationVersion - 1);
      const migrated = new Repository(path, clock);
      migrated.close();

      const database = new Database(path);
      database.pragma(`user_version = ${String(unsupportedVersion)}`);
      database.close();
      const originalBytes = readFileSync(path);

      expect(() => new Repository(path, clock)).toThrow();
      expect(readFileSync(path)).toEqual(originalBytes);
    },
  );
});

function makeDirectory(): string {
  const directory = mkdtempSync(
    join(tmpdir(), 'flowpilot-migration-previous-'),
  );
  directories.push(directory);
  return directory;
}

function expectBackupData(path: string, previousVersion: number): void {
  const backup = new Database(path);
  try {
    expect(backup.pragma('user_version')).toEqual([
      { user_version: previousVersion },
    ]);
    expect(
      backup
        .prepare('SELECT title,created_at,updated_at FROM tasks WHERE id = ?')
        .get('legacy-task'),
    ).toEqual({
      title: 'Prepare migration tests',
      created_at: '2026-10-01T09:00:00.000Z',
      updated_at: '2026-10-05T12:00:00.000Z',
    });
    expect(
      backup
        .prepare('SELECT name FROM attachments WHERE id = ?')
        .get('legacy-attachment'),
    ).toEqual({ name: 'release-notes.txt' });
    expect(
      backup
        .prepare('SELECT value_json FROM settings WHERE key = ?')
        .get('workdays'),
    ).toEqual({ value_json: '[1,3,5]' });
  } finally {
    backup.close();
  }
}

function expectMigratedData(path: string, previousVersion: number): void {
  const database = new Database(path);
  try {
    expect(database.pragma('user_version')).toEqual([
      { user_version: latestMigrationVersion },
    ]);
    expect(
      database
        .prepare('SELECT revision FROM metadata WHERE singleton = 1')
        .get(),
    ).toEqual({ revision: legacySnapshot.revision });
    expect(
      database
        .prepare('SELECT created_at,updated_at FROM tasks WHERE id = ?')
        .get('legacy-task'),
    ).toEqual({
      created_at: '2026-10-01T09:00:00.000Z',
      updated_at: '2026-10-05T12:00:00.000Z',
    });
    expectAttachmentColumns(database, previousVersion);
    expectNewColumnDefaults(database);
    expectMigrationHistory(database, previousVersion);
  } finally {
    database.close();
  }
}

function expectAttachmentColumns(
  database: Database.Database,
  previousVersion: number,
): void {
  expect(
    database
      .prepare('SELECT sha256,created_at FROM attachments WHERE id = ?')
      .get('legacy-attachment'),
  ).toEqual({
    sha256: previousVersion < 2 ? '' : LEGACY_ATTACHMENT_HASH,
    created_at: previousVersion < 2 ? '' : '2026-10-01T09:00:00.000Z',
  });
}

function expectNewColumnDefaults(database: Database.Database): void {
  expect(
    database
      .prepare('SELECT version FROM columns WHERE id = ?')
      .get('legacy-column'),
  ).toEqual({ version: 1 });
  expect(
    database
      .prepare('SELECT version FROM settings WHERE key = ?')
      .get('dailyGoal'),
  ).toEqual({ version: 1 });
  expect(
    database
      .prepare('SELECT generation FROM column_generations WHERE id = ?')
      .get('legacy-column'),
  ).toEqual({ generation: 1 });
}

function expectMigrationHistory(
  database: Database.Database,
  previousVersion: number,
): void {
  const expectedEntries = previousVersion >= 3 ? 3 : 0;
  expect(
    database.prepare('SELECT COUNT(*) AS count FROM change_log').get(),
  ).toEqual({ count: expectedEntries });
  if (previousVersion < 3) return;

  expect(
    database
      .prepare(
        'SELECT version_after FROM change_log_entities WHERE entry_id = ? AND entity_id = ?',
      )
      .get('retired-column-deleted', 'retired-column'),
  ).toEqual({ version_after: 2 });
  expect(
    database
      .prepare('SELECT generation FROM column_generations WHERE id = ?')
      .get('retired-column'),
  ).toEqual({ generation: 2 });
}

function listBackupFiles(directory: string): string[] {
  const backupFiles: string[] = [];
  for (const filename of readdirSync(directory)) {
    if (filename.includes('.bak-v')) backupFiles.push(filename);
  }
  return backupFiles.sort();
}
