import initialSchema from '../../../src/storage/migrations/0001_init.sql?raw';
import attachmentIntegrity from '../../../src/storage/migrations/0002_attachment_integrity.sql?raw';
import historySchema from '../../../src/storage/migrations/0003_change_log.sql?raw';
import entityVersions from '../../../src/storage/migrations/0004_entity_versions.sql?raw';
import columnGenerations from '../../../src/storage/migrations/0005_column_generations.sql?raw';
import legacyTombstoneGenerations from '../../../src/storage/migrations/0006_legacy_tombstone_generations.sql?raw';
import restoreHistory from '../../../src/storage/migrations/0007_restore_history.sql?raw';
import aiApplication from '../../../src/storage/migrations/0008_ai_application.sql?raw';
import rejectedAiCommands from '../../../src/storage/migrations/0009_rejected_ai_commands.sql?raw';
import commentCreatedAtNullable from '../../../src/storage/migrations/0013_comment_created_at_nullable.sql?raw';

export const migrationFiles = [
  { version: 1, filename: '0001_init.sql', sql: initialSchema },
  {
    version: 2,
    filename: '0002_attachment_integrity.sql',
    sql: attachmentIntegrity,
  },
  { version: 3, filename: '0003_change_log.sql', sql: historySchema },
  { version: 4, filename: '0004_entity_versions.sql', sql: entityVersions },
  {
    version: 5,
    filename: '0005_column_generations.sql',
    sql: columnGenerations,
  },
  {
    version: 6,
    filename: '0006_legacy_tombstone_generations.sql',
    sql: legacyTombstoneGenerations,
  },
  {
    version: 7,
    filename: '0007_restore_history.sql',
    sql: restoreHistory,
  },
  {
    version: 8,
    filename: '0008_ai_application.sql',
    sql: aiApplication,
  },
  {
    version: 9,
    filename: '0009_rejected_ai_commands.sql',
    sql: rejectedAiCommands,
  },
  {
    version: 13,
    filename: '0013_comment_created_at_nullable.sql',
    sql: commentCreatedAtNullable,
  },
] as const;

export const latestMigrationVersion = migrationFiles.at(-1)?.version ?? 0;
