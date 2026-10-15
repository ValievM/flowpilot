import type Database from 'better-sqlite3';
import type { EntitySnapshot } from './history-entities';

type UndoEntity = {
  readonly ref: EntitySnapshot;
  readonly before: EntitySnapshot;
};

export function referencedTasksForCreatedColumns(
  database: Database.Database,
  records: readonly UndoEntity[],
): EntitySnapshot[] {
  const createdTaskIds = new Set(
    records
      .filter(({ ref, before }) => ref.kind === 'task' && before.state === null)
      .map(({ ref }) => ref.id),
  );
  const references: EntitySnapshot[] = [];
  for (const { ref, before } of records) {
    if (ref.kind !== 'column' || before.state !== null) continue;
    const rows = database
      .prepare('SELECT id FROM tasks WHERE column_id = ?')
      .all(ref.id) as { id: string }[];
    for (const { id } of rows) {
      if (createdTaskIds.has(id)) continue;
      references.push({ kind: 'task', id, state: null, version: null });
    }
  }
  return references;
}

export function referencedOutcomesForCreatedSeries(
  database: Database.Database,
  records: readonly UndoEntity[],
): EntitySnapshot[] {
  const createdOutcomeIds = new Set(
    records
      .filter(
        ({ ref, before }) =>
          ref.kind === 'series_outcome' && before.state === null,
      )
      .map(({ ref }) => ref.id),
  );
  const references: EntitySnapshot[] = [];
  for (const { ref, before } of records) {
    if (ref.kind !== 'series' || before.state !== null) continue;
    const rows = database
      .prepare('SELECT series_id,date FROM series_outcomes WHERE series_id=?')
      .all(ref.id) as { series_id: string; date: string }[];
    for (const row of rows) {
      const id = `${row.series_id}:${row.date}`;
      if (createdOutcomeIds.has(id)) continue;
      references.push({
        kind: 'series_outcome',
        id,
        state: null,
        version: null,
      });
    }
  }
  return references;
}
