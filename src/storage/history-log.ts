import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { EntitySnapshot } from './history-entities';
import type { HistoryEntry } from './types';

type StoredEntity = EntitySnapshot;
type HistoryWriteOptions = {
  revision: number;
  occurredAt: string;
  source: 'user' | 'ai' | 'undo';
  undoneEntryId?: string;
};

export function writeHistory(
  database: Database.Database,
  snapshots: readonly { before: StoredEntity; after: StoredEntity }[],
  options: HistoryWriteOptions,
): string {
  const { revision, occurredAt, source, undoneEntryId = null } = options;
  const id = randomUUID();
  database
    .prepare(
      'INSERT INTO change_log(id,revision,occurred_at,source,batch_id,undone_entry_id) VALUES(?,?,?,?,?,?)',
    )
    .run(id, revision, occurredAt, source, randomUUID(), undoneEntryId);
  const insert = database.prepare(
    'INSERT INTO change_log_entities(entry_id,entity_kind,entity_id,state_before_json,state_after_json,version_after) VALUES(?,?,?,?,?,?)',
  );
  for (const { before, after } of snapshots)
    insert.run(
      id,
      after.kind,
      after.id,
      before.state,
      after.state,
      after.version,
    );
  return id;
}

export function readHistory(
  database: Database.Database,
  limit: number,
  before?: string,
): readonly HistoryEntry[] {
  const pageSize = Math.max(0, limit);
  const rows = before
    ? database
        .prepare(
          'SELECT id,revision,occurred_at,source,batch_id,undone_entry_id FROM change_log WHERE revision < (SELECT revision FROM change_log WHERE id = ?) ORDER BY revision DESC LIMIT ?',
        )
        .all(before, pageSize)
    : database
        .prepare(
          'SELECT id,revision,occurred_at,source,batch_id,undone_entry_id FROM change_log ORDER BY revision DESC LIMIT ?',
        )
        .all(pageSize);
  return (
    rows as {
      id: string;
      revision: number;
      occurred_at: string;
      source: 'user' | 'ai' | 'undo';
      batch_id: string;
      undone_entry_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    revision: row.revision,
    occurredAt: row.occurred_at,
    source: row.source,
    batchId: row.batch_id,
    undoneEntryId: row.undone_entry_id,
    entities: readEntities(database, row.id),
  }));
}

function readEntities(
  database: Database.Database,
  entryId: string,
): HistoryEntry['entities'] {
  const rows = database
    .prepare(
      'SELECT entity_kind,entity_id,state_before_json,state_after_json,version_after FROM change_log_entities WHERE entry_id = ? ORDER BY entity_kind,entity_id',
    )
    .all(entryId) as {
    entity_kind: string;
    entity_id: string;
    state_before_json: string | null;
    state_after_json: string | null;
    version_after: number | null;
  }[];
  return rows.map((row) => ({
    kind: row.entity_kind,
    id: row.entity_id,
    before:
      row.state_before_json === null
        ? null
        : (JSON.parse(row.state_before_json) as unknown),
    after:
      row.state_after_json === null
        ? null
        : (JSON.parse(row.state_after_json) as unknown),
    versionAfter: row.version_after,
  }));
}
