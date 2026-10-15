import type Database from 'better-sqlite3';
import { Temporal } from 'temporal-polyfill';
import type { Outcome, Series } from '../domain';
import type {
  SeriesChanges,
  SeriesOutcomeInput,
  StorageCommand,
} from './types';

type SeriesRow = {
  id: string;
  title: string;
  description: string | null;
  weekdays_json: string;
  time: string | null;
  starts_on: string;
  ends_on: string | null;
};
type OutcomeRow = {
  series_id: string;
  date: string;
  kind: Outcome['kind'];
  new_date: string | null;
  new_time: string | null;
  recorded_at: string;
};

export function loadSeries(database: Database.Database): readonly Series[] {
  const rows = database
    .prepare(
      'SELECT id,title,description,weekdays_json,time,starts_on,ends_on FROM series ORDER BY id',
    )
    .all() as SeriesRow[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    weekdays: JSON.parse(row.weekdays_json) as number[],
    ...(row.time === null ? {} : { time: Temporal.PlainTime.from(row.time) }),
    startsOn: Temporal.PlainDate.from(row.starts_on),
    ...(row.ends_on === null
      ? {}
      : { endsOn: Temporal.PlainDate.from(row.ends_on) }),
  }));
}

export function loadOutcomes(database: Database.Database): readonly Outcome[] {
  const rows = database
    .prepare(
      'SELECT series_id,date,kind,new_date,new_time,recorded_at FROM series_outcomes ORDER BY series_id,date',
    )
    .all() as OutcomeRow[];
  return rows.map((row) => {
    const base = {
      seriesId: row.series_id,
      date: Temporal.PlainDate.from(row.date),
      recordedAt: Temporal.Instant.from(row.recorded_at),
    };
    if (row.kind !== 'rescheduled') return { ...base, kind: row.kind };
    if (row.new_date === null || row.new_time === null)
      throw new Error('Invalid rescheduled outcome');
    return {
      ...base,
      kind: row.kind,
      newDate: Temporal.PlainDate.from(row.new_date),
      newTime: Temporal.PlainTime.from(row.new_time),
    };
  });
}

export function executeSeriesCommand(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: `series.${string}` }>,
  now: string,
): void {
  switch (command.kind) {
    case 'series.create':
      createSeries(database, command.series, now);
      return;
    case 'series.update':
      updateSeries(database, command.id, command.changes, now);
      return;
    case 'series.stop':
      stopSeries(database, command.id, command.endDate.toString(), now);
      return;
    case 'series.recordOutcome':
      recordOutcome(database, command.seriesId, command.outcome, now);
  }
}

function createSeries(
  database: Database.Database,
  series: Series,
  now: string,
): void {
  assertDateRange(
    series.startsOn.toString(),
    series.endsOn?.toString() ?? null,
  );
  database
    .prepare(
      'INSERT INTO series(id,title,description,weekdays_json,time,starts_on,ends_on,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)',
    )
    .run(
      series.id,
      series.title,
      series.description ?? null,
      JSON.stringify(series.weekdays),
      series.time?.toString() ?? null,
      series.startsOn.toString(),
      series.endsOn?.toString() ?? null,
      now,
      now,
    );
}

function updateSeries(
  database: Database.Database,
  id: string,
  changes: SeriesChanges,
  now: string,
): void {
  const row = database.prepare('SELECT * FROM series WHERE id = ?').get(id) as
    SeriesRow | undefined;
  if (!row) throw new Error('Series not found');
  const next = updatedSeriesFields(row, changes);
  assertDateRange(next.startsOn, next.endsOn);
  database
    .prepare(
      'UPDATE series SET title=?,description=?,weekdays_json=?,time=?,starts_on=?,ends_on=?,version=version+1,updated_at=? WHERE id=?',
    )
    .run(
      next.title,
      next.description,
      next.weekdaysJson,
      next.time,
      next.startsOn,
      next.endsOn,
      now,
      id,
    );
}

function updatedSeriesFields(row: SeriesRow, changes: SeriesChanges) {
  return {
    title: updatedValue(row.title, changes.title),
    description: updatedValue(row.description, changes.description),
    weekdaysJson: JSON.stringify(
      updatedValue(JSON.parse(row.weekdays_json) as number[], changes.weekdays),
    ),
    time: updatedTemporalField(row.time, changes.time),
    startsOn: changes.startsOn?.toString() ?? row.starts_on,
    endsOn: updatedTemporalField(row.ends_on, changes.endsOn),
  };
}

function updatedValue<T>(current: T, next: T | undefined): T {
  return next === undefined ? current : next;
}

function updatedTemporalField(
  current: string | null,
  next: Temporal.PlainDate | Temporal.PlainTime | null | undefined,
): string | null {
  return next === undefined ? current : (next?.toString() ?? null);
}

function stopSeries(
  database: Database.Database,
  id: string,
  endDate: string,
  now: string,
): void {
  const row = database
    .prepare('SELECT starts_on FROM series WHERE id=?')
    .get(id) as { starts_on: string } | undefined;
  if (!row) throw new Error('Series not found');
  assertDateRange(row.starts_on, endDate);
  database
    .prepare(
      'UPDATE series SET ends_on=?,version=version+1,updated_at=? WHERE id=?',
    )
    .run(endDate, now, id);
}

function assertDateRange(startsOn: string, endsOn: string | null): void {
  if (endsOn && Temporal.PlainDate.compare(endsOn, startsOn) < 0)
    throw new Error('Series end date must not precede its start date');
}

function recordOutcome(
  database: Database.Database,
  seriesId: string,
  outcome: SeriesOutcomeInput<Outcome>,
  now: string,
): void {
  const fields =
    outcome.kind === 'rescheduled'
      ? [outcome.kind, outcome.newDate.toString(), outcome.newTime.toString()]
      : [outcome.kind, null, null];
  const existing = database
    .prepare(
      'SELECT kind,new_date,new_time FROM series_outcomes WHERE series_id=? AND date=?',
    )
    .get(seriesId, outcome.date.toString()) as
    | { kind: string; new_date: string | null; new_time: string | null }
    | undefined;
  if (
    existing !== undefined &&
    existing.kind === fields[0] &&
    existing.new_date === fields[1] &&
    existing.new_time === fields[2]
  )
    return;
  database
    .prepare(
      'INSERT INTO series_outcomes(series_id,date,kind,new_date,new_time,recorded_at) VALUES(?,?,?,?,?,?) ON CONFLICT(series_id,date) DO UPDATE SET kind=excluded.kind,new_date=excluded.new_date,new_time=excluded.new_time,recorded_at=excluded.recorded_at,version=series_outcomes.version+1',
    )
    .run(seriesId, outcome.date.toString(), ...fields, now);
}
