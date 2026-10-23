import Database from 'better-sqlite3';
import { advanceColumnGeneration } from './column-generations';
import {
  restoreScheduleHistoryEntity,
  snapshotScheduleHistoryEntity,
} from './schedule-history';
import {
  restoreSeriesHistoryEntity,
  snapshotSeriesHistoryEntity,
} from './series-history';
export type EntityRef =
  | { kind: 'task' | 'column' | 'setting'; id: string }
  | { kind: 'taskType'; id: string }
  | { kind: 'discipline'; id: string }
  | { kind: 'rule'; id: string }
  | { kind: 'schedule'; id: string }
  | { kind: 'series' | 'series_outcome'; id: string };
type Row = Record<string, string | number | null>;
export type EntitySnapshot = EntityRef & {
  state: string | null;
  version: number | null;
};

export function snapshotEntity(
  database: Database.Database,
  ref: EntityRef,
): EntitySnapshot {
  if (ref.kind === 'setting') {
    const row = database
      .prepare('SELECT key,value_json,version FROM settings WHERE key = ?')
      .get(ref.id) as Row | undefined;
    return {
      ...ref,
      state: row ? JSON.stringify(row) : null,
      version: row ? Number(row.version) : null,
    };
  }
  if (ref.kind === 'schedule')
    return snapshotScheduleHistoryEntity(database, ref);
  if (isSeriesEntity(ref)) return snapshotSeriesHistoryEntity(database, ref);
  if (ref.kind === 'column') return snapshotColumn(database, ref);
  if (isStoredEntity(ref)) return snapshotStorageEntity(database, ref);
  const row = database
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(ref.id) as Row | undefined;
  if (!row) return { ...ref, state: null, version: null };
  const relations = (['subtasks', 'comments', 'attachments'] as const).map(
    (table) =>
      database
        .prepare(`SELECT * FROM ${table} WHERE task_id = ? ORDER BY position`)
        .all(ref.id) as Row[],
  );
  const version = row.version as number;
  return {
    ...ref,
    state: JSON.stringify({
      task: row,
      subtasks: relations[0],
      comments: relations[1],
      attachments: relations[2],
    }),
    version,
  };
}
function isSeriesEntity(
  ref: EntityRef,
): ref is Extract<EntityRef, { kind: 'series' | 'series_outcome' }> {
  return ref.kind === 'series' || ref.kind === 'series_outcome';
}

function isStoredEntity(
  ref: EntityRef,
): ref is Extract<EntityRef, { kind: 'taskType' | 'discipline' | 'rule' }> {
  return (
    ref.kind === 'taskType' || ref.kind === 'discipline' || ref.kind === 'rule'
  );
}
function snapshotStorageEntity(
  database: Database.Database,
  ref: Extract<EntityRef, { kind: 'taskType' | 'discipline' | 'rule' }>,
): EntitySnapshot {
  const table =
    ref.kind === 'taskType'
      ? 'task_types'
      : ref.kind === 'discipline'
        ? 'disciplines'
        : 'rule_documents';
  const row = database
    .prepare(`SELECT * FROM ${table} WHERE id=?`)
    .get(ref.id) as Row | undefined;
  if (!row) return { ...ref, state: null, version: null };
  if (ref.kind !== 'rule')
    return { ...ref, state: JSON.stringify(row), version: 1 };
  const versions = database
    .prepare(
      'SELECT rule_id,version,document_json,accepted_at FROM rule_versions WHERE rule_id=? ORDER BY version',
    )
    .all(ref.id) as Row[];
  const documentState = JSON.stringify({ row, versions });
  return { ...ref, state: documentState, version: Number(row.version) };
}

function snapshotColumn(
  database: Database.Database,
  ref: EntityRef,
): EntitySnapshot {
  const row = database
    .prepare('SELECT * FROM columns WHERE id = ?')
    .get(ref.id) as Row | undefined;
  const generation = row
    ? Number(row.version)
    : ((
        database
          .prepare('SELECT generation FROM column_generations WHERE id = ?')
          .get(ref.id) as { generation: number } | undefined
      )?.generation ?? null);
  return {
    ...ref,
    state: row ? JSON.stringify(row) : null,
    version: generation,
  };
}

export function restoreEntity(
  database: Database.Database,
  snapshot: EntitySnapshot,
): void {
  if (snapshot.kind === 'setting') {
    database.prepare('DELETE FROM settings WHERE key = ?').run(snapshot.id);
    if (snapshot.state) {
      const row = JSON.parse(snapshot.state) as Row;
      database
        .prepare('INSERT INTO settings(key,value_json,version) VALUES(?,?,?)')
        .run(row.key, row.value_json, row.version);
    }
    return;
  }
  if (snapshot.kind === 'schedule') {
    restoreScheduleHistoryEntity(database, snapshot);
    return;
  }
  if (snapshot.kind === 'series' || snapshot.kind === 'series_outcome') {
    restoreSeriesHistoryEntity(database, snapshot);
    return;
  }
  if (snapshot.kind === 'column') {
    restoreColumn(database, snapshot);
    return;
  }
  if (
    snapshot.kind === 'taskType' ||
    snapshot.kind === 'discipline' ||
    snapshot.kind === 'rule'
  ) {
    restoreStorageEntity(database, snapshot);
    return;
  }
  restoreTask(database, snapshot);
}
function restoreStorageEntity(
  database: Database.Database,
  snapshot: Extract<
    EntitySnapshot,
    { kind: 'taskType' | 'discipline' | 'rule' }
  >,
): void {
  const table =
    snapshot.kind === 'taskType'
      ? 'task_types'
      : snapshot.kind === 'discipline'
        ? 'disciplines'
        : 'rule_documents';
  if (snapshot.kind === 'rule')
    database
      .prepare('DELETE FROM rule_versions WHERE rule_id=?')
      .run(snapshot.id);
  database.prepare(`DELETE FROM ${table} WHERE id=?`).run(snapshot.id);
  if (!snapshot.state) return;
  if (snapshot.kind !== 'rule') {
    insertRow(database, table, JSON.parse(snapshot.state) as Row);
    return;
  }
  const state = JSON.parse(snapshot.state) as { row: Row; versions: Row[] };
  insertRow(database, table, state.row);
  for (const version of state.versions)
    insertRow(database, 'rule_versions', version);
}

function restoreColumn(
  database: Database.Database,
  snapshot: EntitySnapshot,
): void {
  const current = database
    .prepare('SELECT id FROM columns WHERE id = ?')
    .get(snapshot.id);
  if (!snapshot.state) {
    if (current) {
      advanceColumnGeneration(database, snapshot.id);
      database.prepare('DELETE FROM columns WHERE id = ?').run(snapshot.id);
    }
    return;
  }
  const row = JSON.parse(snapshot.state) as Row;
  const version = advanceColumnGeneration(database, snapshot.id);
  if (current) {
    database
      .prepare(
        'UPDATE columns SET name = ?,description = ?,state = ?,built_in = ?,position = ?,version = ? WHERE id = ?',
      )
      .run(
        row.name,
        row.description,
        row.state,
        row.built_in,
        row.position,
        version,
        snapshot.id,
      );
    return;
  }
  const savedPosition = row.position;
  if (typeof savedPosition !== 'number')
    throw new Error('Invalid column position');
  const occupied = database
    .prepare('SELECT id FROM columns WHERE position = ?')
    .get(savedPosition);
  const position = occupied
    ? (
        database
          .prepare(
            'SELECT COALESCE(MAX(position) + 1, 0) AS position FROM columns',
          )
          .get() as { position: number }
      ).position
    : savedPosition;
  insertRow(database, 'columns', { ...row, position, version });
}

function restoreTask(
  database: Database.Database,
  snapshot: EntitySnapshot,
): void {
  database.prepare('DELETE FROM tasks WHERE id = ?').run(snapshot.id);
  if (!snapshot.state) return;
  const state = JSON.parse(snapshot.state) as {
    task: Row;
    subtasks: Row[];
    comments: Row[];
    attachments: Row[];
  };
  insertRow(database, 'tasks', state.task);
  for (const table of ['subtasks', 'comments', 'attachments'] as const)
    for (const row of state[table]) insertRow(database, table, row);
}

function insertRow(database: Database.Database, table: string, row: Row): void {
  const columns = Object.keys(row);
  const names = columns.join(',');
  const placeholders = columns.map(() => '?').join(',');
  database
    .prepare(`INSERT INTO ${table}(${names}) VALUES(${placeholders})`)
    .run(...columns.map((column) => row[column]));
}
