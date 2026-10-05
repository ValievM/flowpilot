import Database from 'better-sqlite3';
import { commandSchema } from '../shared/command-schema';
import { migrate } from './migrate';
import { loadTask, type TaskRow } from './snapshot-tasks';
import { applyCommands } from './write-commands';
import type { ApplyResult, Clock, Snapshot, StorageCommand } from './types';
import type { TaskColumn } from '../domain';

type ColumnRow = {
  id: string;
  name: string;
  description: string;
  state: TaskColumn['state'];
  built_in: number;
};

export class Repository {
  private readonly database: Database.Database;

  constructor(
    path: string,
    private readonly clock: Clock,
  ) {
    this.database = new Database(path);
    try {
      this.database.pragma('busy_timeout = 5000');
      migrate(this.database, path);
      this.database.pragma('foreign_keys = ON');
      this.database.pragma('journal_mode = WAL');
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
  ): ApplyResult {
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
    return applyCommands(
      this.database,
      commands,
      expectedRevision,
      this.clock.now().toString(),
    );
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
