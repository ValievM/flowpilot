import type Database from 'better-sqlite3';
import {
  restoreEntity,
  snapshotEntity,
  type EntitySnapshot,
} from './history-entities';
import { writeHistory } from './history-log';
import type { UndoResult } from './types';

type AttachmentFiles = {
  restoreFromTrash(id: string): boolean;
  moveToTrash(id: string): boolean;
};
type LogRow = {
  id: string;
  revision: number;
  occurred_at: string;
  source: string;
  undone_entry_id: string | null;
};
type EntityRow = {
  entity_kind: string;
  entity_id: string;
  state_before_json: string | null;
  state_after_json: string | null;
  version_after: number | null;
};

type UndoRecord = {
  ref: EntitySnapshot;
  before: EntitySnapshot;
  after: EntitySnapshot;
};
type UndoPlan = {
  entry: LogRow;
  records: UndoRecord[];
  attachmentChanges: { restore: string[]; trash: string[] };
};

export function undoEntry(
  database: Database.Database,
  attachmentFiles: AttachmentFiles,
  entryId: string | undefined,
  now: string,
): UndoResult {
  const attempt = createUndoPlan(database, entryId);
  if ('result' in attempt) return attempt.result;
  const restored: string[] = [];
  const trashed: string[] = [];
  try {
    for (const id of attempt.plan.attachmentChanges.restore) {
      if (!attachmentFiles.restoreFromTrash(id))
        throw new Error('файл вложения удалён');
      restored.push(id);
    }
    for (const id of attempt.plan.attachmentChanges.trash) {
      if (!attachmentFiles.moveToTrash(id))
        throw new Error('Не удалось переместить вложение в корзину');
      trashed.push(id);
    }
    const revision = applyUndo(database, attempt.plan, now);
    return { ok: true, value: { revision } };
  } catch (error) {
    trashed.forEach((id) => attachmentFiles.restoreFromTrash(id));
    restored.forEach((id) => attachmentFiles.moveToTrash(id));
    return {
      ok: false,
      error: { kind: 'NotUndoable', reason: errorMessage(error) },
    };
  }
}

function createUndoPlan(
  database: Database.Database,
  entryId?: string,
): { plan: UndoPlan } | { result: UndoResult } {
  const entry = findEntry(database, entryId);
  if (!entry) return { result: { ok: false, error: { kind: 'NotFound' } } };
  if (entry.source === 'undo')
    return { result: { ok: false, error: { kind: 'NotUndoable' } } };
  if (isUndone(database, entry.id))
    return { result: { ok: false, error: { kind: 'AlreadyUndone' } } };
  const records = readEntryEntities(database, entry.id);
  const conflicts = records.filter(({ ref, after }) => {
    const current = snapshotEntity(database, ref);
    return current.state !== after.state || current.version !== after.version;
  });
  if (conflicts.length)
    return {
      result: {
        ok: false,
        error: {
          kind: 'UndoConflict',
          entities: conflicts.map(({ ref }) => ref),
        },
      },
    };
  return {
    plan: { entry, records, attachmentChanges: findAttachmentChanges(records) },
  };
}

function applyUndo(
  database: Database.Database,
  plan: UndoPlan,
  now: string,
): number {
  return database.transaction(() => {
    restoreUndoRecords(database, plan.records);
    database
      .prepare(
        'UPDATE metadata SET revision = revision + 1 WHERE singleton = 1',
      )
      .run();
    const revision = readRevision(database);
    const snapshots = plan.records.map(({ after, ref }) => ({
      before: after,
      after: snapshotEntity(database, ref),
    }));
    writeHistory(database, snapshots, {
      revision,
      occurredAt: now,
      source: 'undo',
      undoneEntryId: plan.entry.id,
    });
    return revision;
  })();
}
function restoreUndoRecords(
  database: Database.Database,
  records: readonly UndoRecord[],
): void {
  records
    .filter(({ ref, before }) => ref.kind === 'task' && before.state === null)
    .forEach(({ before }) => {
      restoreEntity(database, before);
    });
  records
    .filter(({ ref }) => ref.kind === 'column')
    .forEach(({ before }) => {
      restoreEntity(database, before);
    });
  records
    .filter(({ ref, before }) => ref.kind === 'task' && before.state !== null)
    .forEach(({ before }) => {
      restoreEntity(database, before);
    });
  records
    .filter(({ ref }) => ref.kind === 'setting')
    .forEach(({ before }) => {
      restoreEntity(database, before);
    });
}

function findEntry(
  database: Database.Database,
  entryId?: string,
): LogRow | undefined {
  const row =
    entryId !== undefined
      ? database
          .prepare(
            'SELECT id,revision,occurred_at,source,undone_entry_id FROM change_log WHERE id = ?',
          )
          .get(entryId)
      : database
          .prepare(
            'SELECT id,revision,occurred_at,source,undone_entry_id FROM change_log ORDER BY revision DESC LIMIT 1',
          )
          .get();
  return row as LogRow | undefined;
}

function isUndone(database: Database.Database, entryId: string): boolean {
  return Boolean(
    database
      .prepare('SELECT id FROM change_log WHERE undone_entry_id = ?')
      .get(entryId),
  );
}

function readEntryEntities(
  database: Database.Database,
  entryId: string,
): { ref: EntitySnapshot; before: EntitySnapshot; after: EntitySnapshot }[] {
  const rows = database
    .prepare(
      'SELECT entity_kind,entity_id,state_before_json,state_after_json,version_after FROM change_log_entities WHERE entry_id = ?',
    )
    .all(entryId) as EntityRow[];
  return rows.map((row) => {
    const kind = entityKind(row.entity_kind);
    const ref = { kind, id: row.entity_id, state: null, version: null };
    return {
      ref,
      before: {
        ...ref,
        state: row.state_before_json,
        version: versionFromState(row.entity_kind, row.state_before_json),
      },
      after: {
        ...ref,
        state: row.state_after_json,
        version: row.version_after,
      },
    };
  });
}

function findAttachmentChanges(
  records: readonly { before: EntitySnapshot; after: EntitySnapshot }[],
): { restore: string[]; trash: string[] } {
  const restore: string[] = [];
  const trash: string[] = [];
  for (const { before, after } of records) {
    if (before.kind !== 'task') continue;
    const beforeIds = new Set(attachmentIds(before.state));
    const afterIds = new Set(attachmentIds(after.state));
    for (const id of beforeIds) if (!afterIds.has(id)) restore.push(id);
    for (const id of afterIds) if (!beforeIds.has(id)) trash.push(id);
  }
  return { restore, trash };
}

function attachmentIds(state: string | null): string[] {
  if (!state) return [];
  const parsed = JSON.parse(state) as { attachments?: { id: string }[] };
  return parsed.attachments?.map(({ id }) => id) ?? [];
}

function entityKind(kind: string): EntitySnapshot['kind'] {
  if (kind === 'task' || kind === 'column' || kind === 'setting') return kind;
  throw new Error('Unknown history entity');
}

function versionFromState(kind: string, state: string | null): number | null {
  if (!state) return null;
  const parsed = JSON.parse(state) as
    { task: { version: number } } | { version: number };
  return 'task' in parsed ? parsed.task.version : parsed.version;
}

function readRevision(database: Database.Database): number {
  const row = database
    .prepare('SELECT revision FROM metadata WHERE singleton = 1')
    .get() as { revision: number };
  return row.revision;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Undo failed';
}
