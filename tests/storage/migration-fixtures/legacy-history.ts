import type Database from 'better-sqlite3';

type HistoryEvent = {
  entryId: string;
  revision: number;
  entityId: string;
  stateBefore: string | null;
  stateAfter: string | null;
  versionAfter: number | null;
};

export function seedLegacyHistory(
  database: Database.Database,
  version: number,
): void {
  if (version < 3) return;
  const activeColumn = columnState(
    'legacy-column',
    'Existing work',
    4,
    version,
  );
  const retiredColumn = columnState(
    'retired-column',
    'Retired work',
    5,
    version,
  );
  insertColumnHistory(database, {
    entryId: 'legacy-column-created',
    revision: 7,
    entityId: 'legacy-column',
    stateBefore: null,
    stateAfter: activeColumn,
    versionAfter: version >= 4 ? 1 : null,
  });
  insertColumnHistory(database, {
    entryId: 'retired-column-created',
    revision: 8,
    entityId: 'retired-column',
    stateBefore: null,
    stateAfter: retiredColumn,
    versionAfter: version >= 4 ? 1 : null,
  });
  insertColumnHistory(database, {
    entryId: 'retired-column-deleted',
    revision: 9,
    entityId: 'retired-column',
    stateBefore: retiredColumn,
    stateAfter: null,
    versionAfter: null,
  });
  if (version >= 5) seedColumnGenerations(database);
}

function columnState(
  id: string,
  name: string,
  position: number,
  version: number,
): string {
  return JSON.stringify({
    id,
    name,
    description: 'Historical column',
    state: 'todo',
    built_in: 0,
    position,
    ...(version >= 4 ? { version: 1 } : {}),
  });
}

function insertColumnHistory(
  database: Database.Database,
  event: HistoryEvent,
): void {
  database
    .prepare(
      'INSERT INTO change_log(id,revision,occurred_at,source,batch_id) VALUES(?,?,?,?,?)',
    )
    .run(
      event.entryId,
      event.revision,
      '2026-10-05T12:00:00.000Z',
      'user',
      `batch-${event.entryId}`,
    );
  database
    .prepare(
      'INSERT INTO change_log_entities(entry_id,entity_kind,entity_id,state_before_json,state_after_json,version_after) VALUES(?,?,?,?,?,?)',
    )
    .run(
      event.entryId,
      'column',
      event.entityId,
      event.stateBefore,
      event.stateAfter,
      event.versionAfter,
    );
}

function seedColumnGenerations(database: Database.Database): void {
  database
    .prepare('INSERT INTO column_generations(id,generation) VALUES(?,?)')
    .run('legacy-column', 1);
  database
    .prepare('INSERT INTO column_generations(id,generation) VALUES(?,?)')
    .run('retired-column', 2);
}
