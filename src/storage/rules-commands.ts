import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { z } from 'zod';
import {
  canActivate,
  lintRules,
  parseRulesJson,
  validateRulesDocument,
} from '../domain';
import type { RulesDocument } from '../domain';
import { executeCatalogCommand, readCatalog } from './catalog-commands';
import type { StorageCommand } from './types';

type RuleRow = {
  id: string;
  document_json: string;
  active_document_json: string | null;
  status: 'draft' | 'active';
  version: number;
};

const ruleIdSchema = z.looseObject({ id: z.string().min(1) });

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

export function executeRulesCommand(
  database: Database.Database,
  command: StorageCommand,
  now: string,
): boolean {
  if (command.kind === 'task.classify') {
    classifyTask(database, command, now);
    return true;
  }
  if (isCatalogCommand(command)) {
    executeCatalogCommand(database, command, now);
    return true;
  }
  return executeRuleCommand(database, command, now);
}

function isCatalogCommand(command: StorageCommand): command is CatalogCommand {
  return (
    command.kind === 'taskType.create' ||
    command.kind === 'taskType.rename' ||
    command.kind === 'taskType.delete' ||
    command.kind === 'discipline.create' ||
    command.kind === 'discipline.rename' ||
    command.kind === 'discipline.delete'
  );
}

function executeRuleCommand(
  database: Database.Database,
  command: StorageCommand,
  now: string,
): boolean {
  switch (command.kind) {
    case 'rule.import':
      importRule(database, command.documentJson, now);
      return true;
    case 'rule.activate':
      activateRule(database, command.ruleId, now);
      return true;
    case 'rule.deactivate':
      updateRuleStatus(database, command.ruleId, now);
      return true;
    case 'rule.bind':
      bindRule(database, command.ruleId, command.scope);
      return true;
    default:
      return false;
  }
}

function classifyTask(
  database: Database.Database,
  command: Extract<StorageCommand, { kind: 'task.classify' }>,
  now: string,
): void {
  if (!database.prepare('SELECT 1 FROM tasks WHERE id = ?').get(command.taskId))
    throw new Error('Task not found');
  const assignments = classificationAssignments(command);
  const classified = assignments.sql ? `${assignments.sql}, ` : '';
  database
    .prepare(
      `UPDATE tasks SET ${classified}version = version + 1, updated_at = ? WHERE id = ?`,
    )
    .run(...assignments.values, now, command.taskId);
}

function classificationAssignments(
  command: Extract<StorageCommand, { kind: 'task.classify' }>,
): { sql: string; values: (string | null)[] } {
  const columns: string[] = [];
  const values: (string | null)[] = [];
  if (command.typeId !== undefined) {
    columns.push('type_id = ?');
    values.push(command.typeId);
  }
  if (command.disciplineId !== undefined) {
    columns.push('discipline_id = ?');
    values.push(command.disciplineId);
  }
  return { sql: columns.join(', '), values };
}

function importRule(
  database: Database.Database,
  documentJson: string,
  now: string,
): void {
  const parsedJson = parseRulesJson(documentJson);
  const value = parsedJson.ok ? parsedJson.value : undefined;
  const parsedId = ruleIdSchema.safeParse(value);
  const candidateId = parsedId.success
    ? parsedId.data.id
    : `invalid-${createHash('sha256').update(documentJson).digest('hex').slice(0, 24)}`;
  const checked = parsedJson.ok
    ? validateRulesDocument(value)
    : { ok: false as const, errors: [parsedJson.error] };
  const diagnostics = checked.ok
    ? lintRules([checked.document], readCatalog(database))
    : [];
  const errors = checked.ok
    ? diagnostics.filter(({ severity }) => severity === 'error')
    : checked.errors;
  const current = readRule(database, candidateId);
  database
    .prepare(
      `INSERT INTO rule_documents(id,document_json,status,version,validation_errors_json,updated_at)
    VALUES(?,?,'draft',?,?,?) ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json,status='draft',version=excluded.version,validation_errors_json=excluded.validation_errors_json,updated_at=excluded.updated_at`,
    )
    .run(
      candidateId,
      documentJson,
      (current?.version ?? 0) + 1,
      JSON.stringify(errors),
      now,
    );
}

function activateRule(
  database: Database.Database,
  id: string,
  now: string,
): void {
  const row = readRule(database, id);
  if (!row) throw new Error('Rule document not found');
  const parsed = parseDocument(row.document_json);
  if (!parsed) throw new Error('Rule document is invalid');
  if (
    !canActivate(
      parsed,
      readRuleDocuments(database, true),
      readCatalog(database),
    )
  )
    throw new Error('Rule cannot be activated');
  database
    .prepare(
      "UPDATE rule_documents SET status='active',active_document_json=document_json,active_version=version,version=version+1,validation_errors_json='[]',updated_at=? WHERE id=?",
    )
    .run(now, id);
  database
    .prepare(
      'INSERT OR IGNORE INTO rule_versions(rule_id,version,document_json,accepted_at) VALUES(?,?,?,?)',
    )
    .run(id, row.version, row.document_json, now);
}

function updateRuleStatus(
  database: Database.Database,
  id: string,
  now: string,
): void {
  const result = database
    .prepare(
      "UPDATE rule_documents SET status='draft',active_document_json=NULL,active_version=NULL,version=version+1,updated_at=? WHERE id=?",
    )
    .run(now, id);
  if (result.changes !== 1) throw new Error('Rule document not found');
}

function bindRule(
  database: Database.Database,
  id: string,
  scope: RulesDocument['scope'],
): void {
  const row = readRule(database, id);
  if (!row) throw new Error('Rule document not found');
  const json: unknown = JSON.parse(row.document_json);
  const value = ruleIdSchema.safeParse(json);
  if (!value.success) throw new Error('Rule document is invalid');
  const updated = { ...value.data, scope };
  const parsed = validateRulesDocument(updated);
  if (!parsed.ok) throw new Error('Rule scope is invalid');
  database
    .prepare(
      "UPDATE rule_documents SET document_json=?,status='draft',version=version+1,validation_errors_json='[]' WHERE id=?",
    )
    .run(JSON.stringify(updated), id);
}

function readRule(
  database: Database.Database,
  id: string,
): RuleRow | undefined {
  return database
    .prepare(
      'SELECT id,document_json,active_document_json,status,version FROM rule_documents WHERE id=?',
    )
    .get(id) as RuleRow | undefined;
}

function readRuleDocuments(
  database: Database.Database,
  activeOnly: boolean,
): RulesDocument[] {
  const column = activeOnly ? 'active_document_json' : 'document_json';
  const predicate = activeOnly ? 'WHERE active_document_json IS NOT NULL' : '';
  const rows = database
    .prepare(
      `SELECT ${column} AS document_json FROM rule_documents ${predicate}`,
    )
    .all() as { document_json: string }[];
  return rows.flatMap(({ document_json }) => {
    const document = parseDocument(document_json);
    return document ? [document] : [];
  });
}

function parseDocument(text: string): RulesDocument | undefined {
  const json = parseRulesJson(text);
  if (!json.ok) return undefined;
  const result = validateRulesDocument(json.value);
  return result.ok ? result.document : undefined;
}
