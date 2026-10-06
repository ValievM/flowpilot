import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import {
  AttachmentStore,
  type AttachmentRecord,
} from './attachments/attachment-store';
import { readHistory } from './history-log';
import { undoEntry } from './history-undo';
import { commandSchema } from '../shared/command-schema';
import { migrate } from './migrate';
import { loadTask, type TaskRow } from './snapshot-tasks';
import { applyCommands } from './write-commands';
import type { TaskColumn } from '../domain';
import type {
  ApplyResult,
  Clock,
  HistoryPage,
  Snapshot,
  StorageCommand,
  UndoResult,
} from './types';

type ColumnRow = {
  id: string;
  name: string;
  description: string;
  state: TaskColumn['state'];
  built_in: number;
};

export class Repository {
  private readonly profilePath: string;
  private readonly database: Database.Database;
  private readonly attachments: AttachmentStore;

  constructor(
    path: string,
    private readonly clock: Clock,
  ) {
    this.profilePath = path;
    this.database = new Database(path);
    try {
      this.database.pragma('busy_timeout = 5000');
      migrate(this.database, path);
      this.database.pragma('foreign_keys = ON');
      this.database.pragma('journal_mode = WAL');
      this.attachments = new AttachmentStore(
        this.database,
        dirname(path),
        this.clock,
      );
      this.attachments.recoverInterruptedRemovals();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  load(): Snapshot {
    const columns = this.database
      .prepare(
        'SELECT id,name,description,state,built_in FROM columns ORDER BY position',
      )
      .all() as ColumnRow[];
    const taskRows = this.database
      .prepare('SELECT * FROM tasks ORDER BY position,id')
      .all() as TaskRow[];
    const tasks = taskRows.map((row) => loadTask(this.database, row));
    const settings = readSettings(this.database);
    const revision = readRevision(this.database);
    return {
      columns: columns.map(({ built_in, ...column }) => ({
        ...column,
        builtIn: built_in === 1,
      })),
      tasks,
      settings,
      revision,
    };
  }

  apply(
    commands: readonly StorageCommand[],
    expectedRevision: number,
    options: { source?: 'user' | 'ai' } = {},
  ): ApplyResult {
    if (commands.length === 0) {
      const actual = readRevision(this.database);
      if (actual !== expectedRevision)
        return {
          ok: false,
          error: { kind: 'StaleRevision', expected: expectedRevision, actual },
        };
      return { ok: true, value: { revision: actual } };
    }
    const invalid = commands.find(
      (command) => !commandSchema.safeParse(command).success,
    );
    if (invalid)
      return {
        ok: false,
        error: {
          kind: 'InvalidCommand',
          message: `Invalid ${invalid.kind} command`,
        },
      };
    const prepared = new Map<number, AttachmentRecord>();
    for (const [index, command] of commands.entries()) {
      if (command.kind !== 'attachment.add') continue;
      const result = this.attachments.prepare(
        command.taskId,
        command.sourcePath,
      );
      if (!result.ok) {
        for (const file of prepared.values()) this.attachments.discard(file.id);
        return {
          ok: false,
          error: { kind: 'InvalidCommand', message: result.error.kind },
        };
      }
      prepared.set(index, result.value);
    }
    return applyCommands(this.database, {
      commands,
      expectedRevision,
      now: this.clock.now().toString(),
      attachmentFiles: this.attachments,
      preparedAttachments: prepared,
      source: options.source ?? 'user',
    });
  }

  history(limit: number, before?: string): HistoryPage {
    return { entries: readHistory(this.database, limit, before) };
  }

  undo(entryId?: string): UndoResult {
    return undoEntry({
      database: this.database,
      attachmentFiles: this.attachments,
      entryId,
      now: this.clock.now().toString(),
    });
  }
  attachmentPath(attachmentId: string): string | undefined {
    return this.attachments.getPath(attachmentId);
  }

  close(): void {
    this.database.close();
  }
}

function readSettings(
  database: Database.Database,
): Readonly<Record<string, unknown>> {
  const rows = database
    .prepare('SELECT key,value_json FROM settings')
    .all() as { key: string; value_json: string }[];
  return Object.fromEntries(
    rows.map(({ key, value_json }) => [key, JSON.parse(value_json) as unknown]),
  );
}

function readRevision(database: Database.Database): number {
  const row = database
    .prepare('SELECT revision FROM metadata WHERE singleton = 1')
    .get() as { revision: number };
  return row.revision;
}
