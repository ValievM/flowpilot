import type Database from 'better-sqlite3';
import { lintRules, parseRulesJson, validateRulesDocument } from '../domain';
import type { Discipline, RuleDiagnostic, TaskType } from '../domain';
import type { StoredRule } from './types';
type CatalogRow = {
  id: string;
  name: string;
  color: NonNullable<TaskType['color']> | null;
};
type RuleRow = {
  id: string;
  document_json: string;
  active_document_json: string | null;
  status: 'draft' | 'active';
  version: number;
  validation_errors_json: string;
};
type VersionRow = { version: number; document_json: string };

export function readRuleSnapshot(database: Database.Database): {
  taskTypes: TaskType[];
  disciplines: Discipline[];
  rules: StoredRule[];
} {
  const taskTypes = readCatalog(database, 'task_types');
  const disciplines = readCatalog(database, 'disciplines');
  const catalog = { taskTypes, disciplines };
  const rows = database
    .prepare(
      'SELECT id,document_json,active_document_json,status,version,validation_errors_json FROM rule_documents ORDER BY id',
    )
    .all() as RuleRow[];
  const documents = rows.flatMap(({ document_json }) => {
    const parsed = parseRulesJson(document_json);
    if (!parsed.ok) return [];
    const result = validateRulesDocument(parsed.value);
    return result.ok ? [result.document] : [];
  });
  const diagnostics = lintRules(documents, catalog);
  const rules = rows.map((row) => readStoredRule(database, row, diagnostics));
  return { taskTypes, disciplines, rules };
}
function readStoredRule(
  database: Database.Database,
  row: RuleRow,
  diagnostics: RuleDiagnostic[],
): StoredRule {
  const parsed = parseRulesJson(row.document_json);
  const result = parsed.ok ? validateRulesDocument(parsed.value) : undefined;
  const activeParsed =
    row.active_document_json === null
      ? undefined
      : parseRulesJson(row.active_document_json);
  const activeResult = activeParsed?.ok
    ? validateRulesDocument(activeParsed.value)
    : undefined;
  const versions = database
    .prepare(
      'SELECT version,document_json FROM rule_versions WHERE rule_id=? ORDER BY version',
    )
    .all(row.id) as VersionRow[];
  return {
    id: row.id,
    documentJson: row.document_json,
    document: result?.ok ? result.document : null,
    activeDocument: activeResult?.ok ? activeResult.document : null,
    status: row.status,
    version: row.version,
    errors: JSON.parse(row.validation_errors_json) as unknown[],
    diagnostics: diagnostics.filter(({ documentId }) => documentId === row.id),
    versions: versions.map(({ version, document_json }) => ({
      version,
      documentJson: document_json,
    })),
  };
}

function readCatalog(
  database: Database.Database,
  table: 'task_types' | 'disciplines',
): TaskType[] {
  const rows = database
    .prepare(`SELECT id,name,color FROM ${table} ORDER BY id`)
    .all() as CatalogRow[];
  return rows.map((row) =>
    row.color === null
      ? { id: row.id, name: row.name }
      : { id: row.id, name: row.name, color: row.color },
  );
}
