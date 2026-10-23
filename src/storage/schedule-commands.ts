import type Database from 'better-sqlite3';
import { Temporal } from 'temporal-polyfill';
import type {
  ManualScheduleEvent,
  ScheduleCommand,
  ScheduleEvent,
  ScheduleSource,
  ScheduleSourceSnapshot,
} from './types';
import {
  importedEvent,
  manualEvent,
  validateManual,
  type EventRow,
} from './schedule-event-mapping';

type SnapshotRow = {
  source: 'modeus' | 'ics' | 'manual';
  fetched_at: string;
  status: 'ok' | 'error';
  last_error: string | null;
};

export function isScheduleCommand(command: {
  readonly kind: string;
}): command is ScheduleCommand {
  return command.kind.startsWith('schedule.');
}

export function executeScheduleCommand(
  database: Database.Database,
  command: ScheduleCommand,
): void {
  switch (command.kind) {
    case 'schedule.import':
      importSchedule(
        database,
        command.source,
        command.events,
        command.fetchedAt,
      );
      return;
    case 'schedule.error':
      recordError(database, command.source, command.message, command.at);
      return;
    case 'schedule.manual.add':
      saveManual(database, command.event, command.at, false);
      return;
    case 'schedule.manual.update':
      if (command.id !== command.event.id)
        throw new Error('Manual event id cannot change');
      saveManual(database, command.event, command.at, true);
      return;
    case 'schedule.manual.remove':
      removeManual(database, command.id, command.at);
      return;
  }
}

export function readScheduleSnapshots(
  database: Database.Database,
  now: Temporal.Instant,
): readonly ScheduleSourceSnapshot[] {
  const snapshots = database
    .prepare(
      'SELECT source,fetched_at,status,last_error FROM schedule_snapshots ORDER BY source',
    )
    .all() as SnapshotRow[];
  const events = database
    .prepare('SELECT * FROM schedule_events ORDER BY source,source_key')
    .all() as EventRow[];
  return snapshots.map((snapshot) => ({
    source: snapshot.source,
    fetchedAt: snapshot.fetched_at,
    status: snapshot.status,
    lastError: snapshot.last_error,
    ageMilliseconds: Math.max(
      0,
      Temporal.Instant.from(snapshot.fetched_at)
        .until(now)
        .total('milliseconds'),
    ),
    events: events
      .filter(({ source }) => source === snapshot.source)
      .map((event) =>
        event.source === 'manual' ? manualEvent(event) : importedEvent(event),
      ),
  }));
}

function importSchedule(
  database: Database.Database,
  source: ScheduleSource,
  events: readonly ScheduleEvent[],
  fetchedAt: string,
): void {
  const fetched = Temporal.Instant.from(fetchedAt).toString();
  const keys = events.map((event) => {
    if (event.source !== source) throw new Error('Event source mismatch');
    return event.key;
  });
  const deleteSql = keys.length
    ? `DELETE FROM schedule_events WHERE source = ? AND start_utc > ? AND source_key NOT IN (${keys.map(() => '?').join(',')})`
    : 'DELETE FROM schedule_events WHERE source = ? AND start_utc > ?';
  database.prepare(deleteSql).run(source, fetched, ...keys);
  const upsert = database.prepare(
    `INSERT INTO schedule_events(
      source_key,source,title,start_utc,end_utc,time_zone,place,cancelled,version
    ) VALUES(?,?,?,?,?,?,?,?,1)
    ON CONFLICT(source,source_key) DO UPDATE SET
      title=excluded.title,start_utc=excluded.start_utc,end_utc=excluded.end_utc,
      time_zone=excluded.time_zone,place=excluded.place,cancelled=excluded.cancelled,
      version=schedule_events.version+1`,
  );
  for (const event of events) {
    const start = Temporal.Instant.from(event.startUtc);
    const end = Temporal.Instant.from(event.endUtc);
    if (Temporal.Instant.compare(start, end) >= 0)
      throw new Error('Event end must follow start');
    start.toZonedDateTimeISO(event.timeZone);
    end.toZonedDateTimeISO(event.timeZone);
    upsert.run(
      event.key,
      source,
      event.title,
      start.toString(),
      end.toString(),
      event.timeZone,
      event.place ?? null,
      event.cancelled ? 1 : 0,
    );
  }
  writeSnapshot(database, {
    source,
    fetchedAt: fetched,
    status: 'ok',
    lastError: null,
  });
}

function recordError(
  database: Database.Database,
  source: ScheduleSource,
  message: string,
  at: string,
): void {
  const timestamp = Temporal.Instant.from(at).toString();
  database
    .prepare(
      `INSERT INTO schedule_snapshots(source,fetched_at,status,last_error,version)
    VALUES(?,?, 'error', ?, 1)
    ON CONFLICT(source) DO UPDATE SET status='error',last_error=excluded.last_error,
      version=schedule_snapshots.version+1`,
    )
    .run(source, timestamp, message);
}

function saveManual(
  database: Database.Database,
  event: ManualScheduleEvent,
  at: string,
  mustExist: boolean,
): void {
  validateManual(event);
  const current = database
    .prepare(
      "SELECT source_key FROM schedule_events WHERE source = 'manual' AND source_key = ?",
    )
    .get(event.id);
  if (mustExist !== (current !== undefined))
    throw new Error(
      mustExist ? 'Manual event not found' : 'Manual event already exists',
    );
  database
    .prepare(
      `INSERT INTO schedule_events(
      source_key,source,title,time_zone,place,weekdays_json,local_start_time,
      local_end_time,recurrence_start,recurrence_end,version
    ) VALUES(?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(source,source_key) DO UPDATE SET title=excluded.title,
      time_zone=excluded.time_zone,place=excluded.place,weekdays_json=excluded.weekdays_json,
      local_start_time=excluded.local_start_time,local_end_time=excluded.local_end_time,
      recurrence_start=excluded.recurrence_start,recurrence_end=excluded.recurrence_end,
      version=schedule_events.version+1`,
    )
    .run(
      event.id,
      event.title,
      event.timeZone,
      event.place ?? null,
      JSON.stringify([...new Set(event.weekdays)].sort((a, b) => a - b)),
      event.startTime,
      event.endTime,
      event.fromDate,
      event.throughDate,
    );
  writeSnapshot(database, {
    source: 'manual',
    fetchedAt: Temporal.Instant.from(at).toString(),
    status: 'ok',
    lastError: null,
  });
}

function removeManual(
  database: Database.Database,
  id: string,
  at: string,
): void {
  const result = database
    .prepare(
      "DELETE FROM schedule_events WHERE source = 'manual' AND source_key = ?",
    )
    .run(id);
  if (result.changes !== 1) throw new Error('Manual event not found');
  writeSnapshot(database, {
    source: 'manual',
    fetchedAt: Temporal.Instant.from(at).toString(),
    status: 'ok',
    lastError: null,
  });
}

function writeSnapshot(
  database: Database.Database,
  snapshot: {
    source: 'modeus' | 'ics' | 'manual';
    fetchedAt: string;
    status: 'ok';
    lastError: null;
  },
): void {
  database
    .prepare(
      `INSERT INTO schedule_snapshots(source,fetched_at,status,last_error,version)
    VALUES(?,?,?,?,1)
    ON CONFLICT(source) DO UPDATE SET fetched_at=excluded.fetched_at,
      status=excluded.status,last_error=excluded.last_error,
      version=schedule_snapshots.version+1`,
    )
    .run(
      snapshot.source,
      snapshot.fetchedAt,
      snapshot.status,
      snapshot.lastError,
    );
}
