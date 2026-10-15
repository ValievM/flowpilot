import type Database from 'better-sqlite3';
import type { Discipline, TaskType } from '../domain';
import type { StorageCommand } from './types';

type CatalogRow = {
  id: string;
  name: string;
  color: NonNullable<TaskType['color']> | null;
};
type CatalogCommand = Extract<
  StorageCommand,
  {
    kind:
      | 'taskType.create'
      | 'taskType.rename'
      | 'taskType.delete'
      | 'discipline.create'
      | 'discipline.rename'
      | 'discipline.delete';
  }
>;

export function executeCatalogCommand(
  database: Database.Database,
  command: CatalogCommand,
  now: string,
): void {
  switch (command.kind) {
    case 'taskType.create':
      insertCatalog(database, 'task_types', command.taskType);
      return;
    case 'taskType.rename':
      renameCatalog(database, 'task_types', command);
      return;
    case 'taskType.delete':
      deleteCatalog(database, command, now);
      return;
    case 'discipline.create':
      insertCatalog(database, 'disciplines', command.discipline);
      return;
    case 'discipline.rename':
      renameCatalog(database, 'disciplines', command);
      return;
    case 'discipline.delete':
      deleteCatalog(database, command, now);
  }
}

function insertCatalog(
  database: Database.Database,
  table: 'task_types' | 'disciplines',
  item: TaskType | Discipline,
): void {
  assertUniqueName(database, table, item.name);
  database
    .prepare(`INSERT INTO ${table}(id,name,color) VALUES(?,?,?)`)
    .run(item.id, item.name, item.color ?? null);
}

function renameCatalog(
  database: Database.Database,
  table: 'task_types' | 'disciplines',
  command: Extract<
    CatalogCommand,
    { kind: 'taskType.rename' | 'discipline.rename' }
  >,
): void {
  assertUniqueName(database, table, command.name, command.id);
  const updated = database
    .prepare(
      `UPDATE ${table} SET name = ?, color = COALESCE(?, color) WHERE id = ?`,
    )
    .run(command.name, command.color ?? null, command.id);
  if (updated.changes !== 1) throw new Error('Catalog item not found');
}

function assertUniqueName(
  database: Database.Database,
  table: 'task_types' | 'disciplines',
  name: string,
  exceptId?: string,
): void {
  const duplicate = database
    .prepare(
      `SELECT 1 FROM ${table} WHERE lower(name)=lower(?) AND id<>COALESCE(?, '')`,
    )
    .get(name, exceptId ?? '');
  if (duplicate) throw new Error('Catalog name already exists');
}

function deleteCatalog(
  database: Database.Database,
  command: Extract<
    CatalogCommand,
    { kind: 'taskType.delete' | 'discipline.delete' }
  >,
  now: string,
): void {
  const table =
    command.kind === 'taskType.delete' ? 'task_types' : 'disciplines';
  const { id, targetId } = command;
  if (targetId === id) throw new Error('Invalid reassignment target');
  if (
    targetId &&
    !database.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(targetId)
  )
    throw new Error('Reassignment target not found');
  reassignTasks(database, { table, id, targetId, now });
  deactivateRelatedRules(database, table, id, now);
  const removed = database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  if (removed.changes !== 1) throw new Error('Catalog item not found');
}

function reassignTasks(
  database: Database.Database,
  options: {
    table: 'task_types' | 'disciplines';
    id: string;
    targetId: string | undefined;
    now: string;
  },
): void {
  const { table, id, targetId, now } = options;
  const column = table === 'task_types' ? 'type_id' : 'discipline_id';
  database
    .prepare(
      `UPDATE tasks SET ${column} = ?, version = version + 1, updated_at=? WHERE ${column} = ?`,
    )
    .run(targetId ?? null, now, id);
}

function deactivateRelatedRules(
  database: Database.Database,
  table: 'task_types' | 'disciplines',
  id: string,
  now: string,
): void {
  const rows = database
    .prepare(
      'SELECT id,active_document_json FROM rule_documents WHERE active_document_json IS NOT NULL',
    )
    .all() as { id: string; active_document_json: string }[];
  for (const rule of rows) {
    if (!referencesCatalogItem(rule.active_document_json, table, id)) continue;
    database
      .prepare(
        "UPDATE rule_documents SET status='draft',active_document_json=NULL,active_version=NULL,version=version+1,updated_at=? WHERE id=?",
      )
      .run(now, rule.id);
  }
}

function referencesCatalogItem(
  documentJson: string,
  table: 'task_types' | 'disciplines',
  id: string,
): boolean {
  try {
    const document = JSON.parse(documentJson) as {
      scope?: { task_type_ids?: unknown; discipline_ids?: unknown };
    };
    const ids =
      table === 'task_types'
        ? document.scope?.task_type_ids
        : document.scope?.discipline_ids;
    return Array.isArray(ids) && ids.includes(id);
  } catch {
    return false;
  }
}

export function readCatalog(database: Database.Database): {
  taskTypes: TaskType[];
  disciplines: Discipline[];
} {
  const taskTypes = readItems(database, 'task_types');
  const disciplines = readItems(database, 'disciplines');
  return { taskTypes, disciplines };
}

function readItems(
  database: Database.Database,
  table: 'task_types' | 'disciplines',
): TaskType[] {
  const rows = database
    .prepare(`SELECT id,name,color FROM ${table} ORDER BY id`)
    .all() as CatalogRow[];
  return rows.map(({ id, name, color }) =>
    color === null ? { id, name } : { id, name, color },
  );
}
