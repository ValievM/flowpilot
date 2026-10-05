import type Database from 'better-sqlite3';
import { executeColumnCommand } from './column-commands';
import {
  affectedEntities,
  snapshotEntity,
  type EntitySnapshot,
} from './history-entities';
import { writeHistory } from './history-log';
import { executeTaskCommand } from './task-commands';
import type { AttachmentRecord } from './attachments/attachment-store';
import type { ApplyResult, StorageCommand } from './types';

type AttachmentFiles = {
  insert(record: AttachmentRecord): void;
  discard(id: string): void;
  moveToTrash(id: string): boolean;
  restoreFromTrash(id: string): boolean;
};
type ApplyOptions = {
  commands: readonly StorageCommand[];
  expectedRevision: number;
  now: string;
  attachmentFiles: AttachmentFiles;
  preparedAttachments: ReadonlyMap<number, AttachmentRecord>;
};
type CommandCapture = { index: number; options: ApplyOptions };
type ChangeSet = Map<string, { before: EntitySnapshot; after: EntitySnapshot }>;

export function applyCommands(
  database: Database.Database,
  options: ApplyOptions,
): ApplyResult {
  const trashed: string[] = [];
  try {
    for (const command of options.commands) {
      if (command.kind !== 'attachment.remove') continue;
      if (!options.attachmentFiles.moveToTrash(command.attachmentId))
        throw new Error('Unable to move attachment to trash');
      trashed.push(command.attachmentId);
    }
    const revision = applyTransaction(database, options);
    return { ok: true, value: { revision } };
  } catch (error) {
    trashed.forEach((id) => options.attachmentFiles.restoreFromTrash(id));
    discardPrepared(options);
    return classifyApplyError(error, options.expectedRevision);
  }
}

function applyTransaction(
  database: Database.Database,
  options: ApplyOptions,
): number {
  const transaction = database.transaction(() => {
    assertRevision(database, options.expectedRevision);
    const changes: ChangeSet = new Map();
    options.commands.forEach((command, index) => {
      captureAndExecute(database, command, { index, options }, changes);
    });
    database
      .prepare(
        'UPDATE metadata SET revision = revision + 1 WHERE singleton = 1',
      )
      .run();
    const revision = readRevision(database);
    writeHistory(database, [...changes.values()], {
      revision,
      occurredAt: options.now,
      source: 'user',
    });
    return revision;
  });
  return transaction();
}

function captureAndExecute(
  database: Database.Database,
  command: StorageCommand,
  capture: CommandCapture,
  changes: ChangeSet,
): void {
  const refs = affectedEntities(database, command);
  const before = refs.map((ref) => snapshotEntity(database, ref));
  before.forEach((snapshot) => {
    const key = entityKey(snapshot);
    if (!changes.has(key))
      changes.set(key, { before: snapshot, after: snapshot });
  });
  executeCommand(database, command, capture.index, capture.options);
  refs.forEach((ref) => {
    const after = snapshotEntity(database, ref);
    const key = entityKey(after);
    const previous = changes.get(key);
    changes.set(key, { before: previous?.before ?? after, after });
  });
}

function executeCommand(
  database: Database.Database,
  command: StorageCommand,
  index: number,
  options: ApplyOptions,
): void {
  if (command.kind === 'attachment.add') {
    const record = options.preparedAttachments.get(index);
    if (!record) throw new Error('Attachment file was not prepared');
    options.attachmentFiles.insert(record);
    touchTask(database, command.taskId, options.now);
    return;
  }
  if (command.kind === 'attachment.remove') {
    removeAttachment(database, command.attachmentId, options.now);
    return;
  }
  if (isColumnCommand(command)) executeColumnCommand(database, command);
  else executeTaskCommand(database, command, options.now);
}

function removeAttachment(
  database: Database.Database,
  id: string,
  now: string,
): void {
  const row = database
    .prepare('SELECT task_id FROM attachments WHERE id = ?')
    .get(id) as { task_id: string } | undefined;
  if (!row) throw new Error('Attachment not found');
  database.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  touchTask(database, row.task_id, now);
}

function assertRevision(database: Database.Database, expected: number): void {
  const actual = readRevision(database);
  if (actual !== expected) throw new StaleRevisionError(expected, actual);
}

function touchTask(
  database: Database.Database,
  taskId: string,
  now: string,
): void {
  const result = database
    .prepare(
      'UPDATE tasks SET version = version + 1, updated_at = ? WHERE id = ?',
    )
    .run(now, taskId);
  if (result.changes !== 1) throw new Error('Task not found');
}

function discardPrepared(options: ApplyOptions): void {
  for (const file of options.preparedAttachments.values())
    options.attachmentFiles.discard(file.id);
}

function classifyApplyError(error: unknown, expected: number): ApplyResult {
  if (error instanceof StaleRevisionError)
    return {
      ok: false,
      error: { kind: 'StaleRevision', expected, actual: error.actual },
    };
  return {
    ok: false,
    error: { kind: 'InvalidCommand', message: errorMessage(error) },
  };
}

function readRevision(database: Database.Database): number {
  const row = database
    .prepare('SELECT revision FROM metadata WHERE singleton = 1')
    .get() as { revision: number } | undefined;
  return row?.revision ?? 0;
}

function entityKey(snapshot: EntitySnapshot): string {
  return `${snapshot.kind}:${snapshot.id}`;
}

function isColumnCommand(
  command: StorageCommand,
): command is Extract<
  StorageCommand,
  { kind: 'column.create' | 'column.rename' | 'column.delete' | 'setting.set' }
> {
  return command.kind.startsWith('column.') || command.kind === 'setting.set';
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Command could not be applied';
}

class StaleRevisionError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `Revision ${String(expected)} is stale; current revision is ${String(actual)}`,
    );
  }
}
