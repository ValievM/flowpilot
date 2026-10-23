import type Database from 'better-sqlite3';
type SeriesHistorySnapshot = {
  kind: 'series' | 'series_outcome';
  id: string;
  state: string | null;
  version: number | null;
};
type Row = Record<string, string | number | null>;

export function snapshotSeriesHistoryEntity(
  database: Database.Database,
  ref: Pick<SeriesHistorySnapshot, 'kind' | 'id'>,
): SeriesHistorySnapshot {
  const row =
    ref.kind === 'series'
      ? (database.prepare('SELECT * FROM series WHERE id=?').get(ref.id) as
          Row | undefined)
      : outcomeRow(database, ref.id);
  return {
    ...ref,
    state: row ? JSON.stringify(row) : null,
    version: row ? Number(row.version) : null,
  };
}

function outcomeRow(database: Database.Database, id: string): Row | undefined {
  const separator = id.lastIndexOf(':');
  return database
    .prepare('SELECT * FROM series_outcomes WHERE series_id=? AND date=?')
    .get(id.slice(0, separator), id.slice(separator + 1)) as Row | undefined;
}

export function restoreSeriesHistoryEntity(
  database: Database.Database,
  snapshot: SeriesHistorySnapshot,
): void {
  if (snapshot.kind === 'series') restoreSeries(database, snapshot);
  else restoreOutcome(database, snapshot);
}

function restoreSeries(
  database: Database.Database,
  snapshot: SeriesHistorySnapshot,
): void {
  const current = database
    .prepare('SELECT version FROM series WHERE id=?')
    .get(snapshot.id) as { version: number } | undefined;
  if (!snapshot.state) {
    database.prepare('DELETE FROM series WHERE id=?').run(snapshot.id);
    return;
  }
  const row = JSON.parse(snapshot.state) as Row;
  insertRow(
    database,
    'series',
    {
      ...row,
      version: current ? current.version + 1 : 1,
    },
    Boolean(current),
  );
}

function restoreOutcome(
  database: Database.Database,
  snapshot: SeriesHistorySnapshot,
): void {
  const separator = snapshot.id.lastIndexOf(':');
  const seriesId = snapshot.id.slice(0, separator);
  const date = snapshot.id.slice(separator + 1);
  const current = database
    .prepare('SELECT version FROM series_outcomes WHERE series_id=? AND date=?')
    .get(seriesId, date) as { version: number } | undefined;
  if (!snapshot.state) {
    database
      .prepare('DELETE FROM series_outcomes WHERE series_id=? AND date=?')
      .run(seriesId, date);
    return;
  }
  if (current)
    database
      .prepare('DELETE FROM series_outcomes WHERE series_id=? AND date=?')
      .run(seriesId, date);
  const row = JSON.parse(snapshot.state) as Row;
  insertRow(database, 'series_outcomes', {
    ...row,
    version: current ? current.version + 1 : 1,
  });
}

function insertRow(
  database: Database.Database,
  table: 'series' | 'series_outcomes',
  row: Row,
  update = false,
): void {
  const columns = Object.keys(row);
  const assignments = columns.map((column) => `${column}=?`).join(',');
  const values = columns.map((column) => row[column]);
  if (update) {
    database
      .prepare(
        `UPDATE ${table} SET ${assignments} WHERE ${table === 'series' ? 'id' : 'series_id'}=?${table === 'series_outcomes' ? ' AND date=?' : ''}`,
      )
      .run(
        ...values,
        row[table === 'series' ? 'id' : 'series_id'],
        ...(table === 'series_outcomes' ? [row.date] : []),
      );
    return;
  }
  database
    .prepare(
      `INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`,
    )
    .run(...values);
}
