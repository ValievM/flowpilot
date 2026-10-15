import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { StorageCommand } from './types';
import type { EntityRef } from './history-entities';

export function affectedEntities(
  database: Database.Database,
  command: StorageCommand,
): EntityRef[] {
  const taskEntities = affectedTaskEntities(database, command);
  if (taskEntities) return taskEntities;
  const columnEntities = affectedColumnEntities(database, command);
  if (columnEntities) return columnEntities;
  const catalogEntitiesForCommand = affectedCatalogEntities(database, command);
  if (catalogEntitiesForCommand) return catalogEntitiesForCommand;
  return affectedOtherEntities(database, command) ?? [];
}
function affectedOtherEntities(
  database: Database.Database,
  command: StorageCommand,
): EntityRef[] | undefined {
  if (
    command.kind === 'series.create' ||
    command.kind === 'series.update' ||
    command.kind === 'series.stop' ||
    command.kind === 'series.recordOutcome'
  )
    return affectedSeriesEntity(command);
  if (
    command.kind === 'rule.import' ||
    command.kind === 'rule.activate' ||
    command.kind === 'rule.deactivate' ||
    command.kind === 'rule.bind'
  )
    return ruleEntities(database, command);
  if (command.kind === 'setting.set')
    return [{ kind: 'setting', id: command.key }];
  return undefined;
}
function affectedSeriesEntity(
  command: Extract<StorageCommand, { kind: `series.${string}` }>,
): EntityRef[] {
  if (command.kind === 'series.create')
    return [{ kind: 'series', id: command.series.id }];
  if (command.kind === 'series.update' || command.kind === 'series.stop')
    return [{ kind: 'series', id: command.id }];
  return [
    {
      kind: 'series_outcome',
      id: `${command.seriesId}:${command.outcome.date.toString()}`,
    },
  ];
}

function affectedTaskEntities(
  database: Database.Database,
  command: StorageCommand,
): EntityRef[] | undefined {
  if ('task' in command) return [{ kind: 'task', id: command.task.id }];
  if ('taskId' in command) return [{ kind: 'task', id: command.taskId }];
  if (command.kind === 'task.update' || command.kind === 'task.move')
    return [{ kind: 'task', id: command.id }];
  if (command.kind === 'attachment.remove')
    return attachmentOwner(database, command.attachmentId);
  return undefined;
}

function affectedColumnEntities(
  database: Database.Database,
  command: StorageCommand,
): EntityRef[] | undefined {
  if ('column' in command) return [{ kind: 'column', id: command.column.id }];
  if (command.kind === 'column.rename')
    return [{ kind: 'column', id: command.id }];
  if (command.kind === 'column.delete')
    return deletedColumnEntities(database, command.id);
  return undefined;
}

function affectedCatalogEntities(
  database: Database.Database,
  command: StorageCommand,
): EntityRef[] | undefined {
  if (command.kind === 'taskType.create')
    return catalogEntities(database, 'taskType', command.taskType.id, false);
  if (command.kind === 'taskType.rename')
    return catalogEntities(database, 'taskType', command.id, false);
  if (command.kind === 'taskType.delete')
    return catalogEntities(database, 'taskType', command.id, true);
  if (command.kind === 'discipline.create')
    return catalogEntities(
      database,
      'discipline',
      command.discipline.id,
      false,
    );
  if (command.kind === 'discipline.rename')
    return catalogEntities(database, 'discipline', command.id, false);
  if (command.kind === 'discipline.delete')
    return catalogEntities(database, 'discipline', command.id, true);
  return undefined;
}

function catalogEntities(
  database: Database.Database,
  kind: 'taskType' | 'discipline',
  id: string,
  deleting: boolean,
): EntityRef[] {
  const refs: EntityRef[] = [{ kind, id }];
  if (!deleting) return refs;
  const column = kind === 'taskType' ? 'type_id' : 'discipline_id';
  const tasks = database
    .prepare(`SELECT id FROM tasks WHERE ${column}=?`)
    .all(id) as { id: string }[];
  refs.push(
    ...tasks.map(({ id: taskId }) => ({ kind: 'task' as const, id: taskId })),
  );
  for (const rule of storedRules(database)) {
    if (referencesCatalogItem(rule.documentJson, kind, id))
      refs.push({ kind: 'rule', id: rule.id });
  }
  return refs;
}

function storedRules(database: Database.Database): {
  id: string;
  documentJson: string;
}[] {
  const rows = database
    .prepare('SELECT id,document_json,active_document_json FROM rule_documents')
    .all() as {
    id: string;
    document_json: string;
    active_document_json: string | null;
  }[];
  return rows.map(({ id, document_json, active_document_json }) => ({
    id,
    documentJson: active_document_json ?? document_json,
  }));
}

function referencesCatalogItem(
  documentJson: string,
  kind: 'taskType' | 'discipline',
  id: string,
): boolean {
  try {
    const document = JSON.parse(documentJson) as {
      scope?: { task_type_ids?: unknown; discipline_ids?: unknown };
    };
    const ids =
      kind === 'taskType'
        ? document.scope?.task_type_ids
        : document.scope?.discipline_ids;
    return Array.isArray(ids) && ids.includes(id);
  } catch {
    return false;
  }
}

function ruleEntities(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: `rule.${string}` }>,
): EntityRef[] {
  if (command.kind === 'rule.import') {
    try {
      const value = JSON.parse(command.documentJson) as { id?: unknown };
      if (typeof value.id === 'string') return [{ kind: 'rule', id: value.id }];
    } catch {
      // Invalid JSON has a stable history identity based on its content.
    }
    const id = `invalid-${createHash('sha256').update(command.documentJson).digest('hex').slice(0, 24)}`;
    return [{ kind: 'rule', id }];
  }
  return [{ kind: 'rule', id: command.ruleId }];
}

function attachmentOwner(database: Database.Database, id: string): EntityRef[] {
  const row = database
    .prepare('SELECT task_id FROM attachments WHERE id = ?')
    .get(id) as { task_id: string } | undefined;
  return row ? [{ kind: 'task', id: row.task_id }] : [];
}

function deletedColumnEntities(
  database: Database.Database,
  id: string,
): EntityRef[] {
  const rows = database
    .prepare('SELECT id FROM tasks WHERE column_id = ?')
    .all(id) as { id: string }[];
  return [
    { kind: 'column', id },
    ...rows.map(({ id: taskId }) => ({ kind: 'task' as const, id: taskId })),
  ];
}
