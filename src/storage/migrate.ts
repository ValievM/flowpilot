import { copyFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import initialSchema from './migrations/0001_init.sql?raw';
import attachmentIntegrity from './migrations/0002_attachment_integrity.sql?raw';
import historySchema from './migrations/0003_change_log.sql?raw';
import entityVersions from './migrations/0004_entity_versions.sql?raw';
import columnGenerations from './migrations/0005_column_generations.sql?raw';
import legacyTombstoneGenerations from './migrations/0006_legacy_tombstone_generations.sql?raw';
import restoreHistory from './migrations/0007_restore_history.sql?raw';

const MIGRATIONS = [
  { version: 1, sql: initialSchema },
  { version: 2, sql: attachmentIntegrity },
  { version: 3, sql: historySchema },
  { version: 4, sql: entityVersions },
  { version: 5, sql: columnGenerations },
  { version: 6, sql: legacyTombstoneGenerations },
  { version: 7, sql: restoreHistory },
] as const;

export class ForeignDatabaseError extends Error {
  constructor() {
    super('Foreign database schema is not supported');
    this.name = 'ForeignDatabaseError';
  }
}

export function migrate(database: Database.Database, path: string): void {
  const current = readUserVersion(database);
  const latest = MIGRATIONS.at(-1)?.version ?? 0;
  if (current > latest)
    throw new Error(
      `Database version ${String(current)} is newer than supported version ${String(latest)}`,
    );
  if (current === latest) return;
  const hasTables = hasUserTables(database);
  if (current === 0 && hasTables) throw new ForeignDatabaseError();
  if (hasTables) {
    database.pragma('wal_checkpoint(FULL)');
    copyFileSync(path, `${path}.bak-v${String(current)}`);
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database.pragma(`user_version = ${String(migration.version)}`);
    })();
  }
}

function readUserVersion(database: Database.Database): number {
  const rows = database.pragma('user_version') as { user_version: number }[];
  return rows[0]?.user_version ?? 0;
}

function hasUserTables(database: Database.Database): boolean {
  const row = database
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
    )
    .get() as { present?: number } | undefined;
  return row !== undefined;
}
