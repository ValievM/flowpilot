import type Database from 'better-sqlite3';
import { executeColumnCommand } from './column-commands';
import { executeTaskCommand } from './task-commands';
import type { ApplyResult, StorageCommand } from './types';

export function applyCommands(
  database: Database.Database,
  commands: readonly StorageCommand[],
  expectedRevision: number,
  now: string,
): ApplyResult {
  try {
    const apply = database.transaction(() => {
      const revision = readRevision(database);
      if (revision !== expectedRevision)
        throw new StaleRevisionError(expectedRevision, revision);
      for (const command of commands) {
        if (isColumnCommand(command)) executeColumnCommand(database, command);
        else executeTaskCommand(database, command, now);
      }
      database
        .prepare(
          'UPDATE metadata SET revision = revision + 1 WHERE singleton = 1',
        )
        .run();
      return readRevision(database);
    });
    return { ok: true, value: { revision: apply() } };
  } catch (error) {
    if (error instanceof StaleRevisionError)
      return {
        ok: false,
        error: {
          kind: 'StaleRevision',
          expected: error.expected,
          actual: error.actual,
        },
      };
    return {
      ok: false,
      error: { kind: 'InvalidCommand', message: errorMessage(error) },
    };
  }
}

function readRevision(database: Database.Database): number {
  const row = database
    .prepare('SELECT revision FROM metadata WHERE singleton = 1')
    .get() as { revision: number } | undefined;
  return row?.revision ?? 0;
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
  if (error instanceof Error) return error.message;
  return 'Command could not be applied';
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
