import type Database from 'better-sqlite3';

type ScheduleHistorySnapshot = {
  kind: 'schedule';
  id: string;
  state: string | null;
  version: number | null;
};
type Row = Record<string, string | number | null>;

/**
 * One history entity per schedule source: the source snapshot row plus all of
 * its events, so undoing an import restores the whole source at once.
 */
export function snapshotScheduleHistoryEntity(
  database: Database.Database,
  ref: Pick<ScheduleHistorySnapshot, 'kind' | 'id'>,
): ScheduleHistorySnapshot {
  const row = database
    .prepare('SELECT * FROM schedule_snapshots WHERE source=?')
    .get(ref.id) as Row | undefined;
  const events = database
    .prepare('SELECT * FROM schedule_events WHERE source=? ORDER BY source_key')
    .all(ref.id) as Row[];
  return {
    ...ref,
    state: row ? JSON.stringify({ row, events }) : null,
    version: row ? Number(row.version) : null,
  };
}

export function restoreScheduleHistoryEntity(
  database: Database.Database,
  snapshot: ScheduleHistorySnapshot,
): void {
  const current = database
    .prepare('SELECT version FROM schedule_snapshots WHERE source=?')
    .get(snapshot.id) as { version: number } | undefined;
  database
    .prepare('DELETE FROM schedule_events WHERE source=?')
    .run(snapshot.id);
  database
    .prepare('DELETE FROM schedule_snapshots WHERE source=?')
    .run(snapshot.id);
  if (!snapshot.state) return;
  const state = JSON.parse(snapshot.state) as { row: Row; events: Row[] };
  insertRow(database, 'schedule_snapshots', {
    ...state.row,
    version: (current?.version ?? 0) + 1,
  });
  for (const event of state.events)
    insertRow(database, 'schedule_events', event);
}

function insertRow(
  database: Database.Database,
  table: 'schedule_snapshots' | 'schedule_events',
  row: Row,
): void {
  const columns = Object.keys(row);
  database
    .prepare(
      `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
    )
    .run(...columns.map((column) => row[column]));
}
