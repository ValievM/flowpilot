import type { RulesDocument } from './rules';
import type { Discipline, TaskType } from './task';
import { findRuleConflicts } from './rules-conflicts';

export interface RuleCatalog {
  readonly taskTypes: readonly TaskType[];
  readonly disciplines: readonly Discipline[];
}

export interface RuleDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly documentId: string;
  readonly path: string;
  readonly action: 'bind' | 'fix-field' | 'resolve-conflict';
}

export function lintRules(
  documents: readonly RulesDocument[],
  catalog: RuleCatalog,
): RuleDiagnostic[] {
  const seen = new Set<string>();
  const diagnostics = documents.flatMap((document) => {
    const repeated = seen.has(document.id);
    seen.add(document.id);
    return documentDiagnostics(document, catalog, repeated);
  });
  diagnostics.push(...uncoveredTaskTypes(documents, catalog));
  diagnostics.push(...findRuleConflicts(documents));
  return uniqueDiagnostics(diagnostics);
}

export function canActivate(
  candidate: RulesDocument,
  activeDocuments: readonly RulesDocument[],
  catalog: RuleCatalog,
): boolean {
  const otherDocuments = activeDocuments.filter(
    (document) => document.id !== candidate.id,
  );
  return !lintRules([...otherDocuments, candidate], catalog).some(
    (item) => item.severity === 'error' && item.documentId === candidate.id,
  );
}

function documentDiagnostics(
  document: RulesDocument,
  catalog: RuleCatalog,
  repeated: boolean,
): RuleDiagnostic[] {
  const diagnostics: RuleDiagnostic[] = [];
  if (repeated) {
    diagnostics.push(
      diagnostic(
        { severity: 'error', action: 'fix-field' },
        'duplicate-document-id',
        document.id,
        'id',
      ),
    );
  }
  if (document.scope.task_type_ids.length === 0) {
    diagnostics.push(
      diagnostic(
        { severity: 'warning', action: 'bind' },
        'unbound-document',
        document.id,
        'scope.task_type_ids',
      ),
    );
  }
  diagnostics.push(...unknownTaskTypes(document, catalog));
  diagnostics.push(...unknownDisciplines(document, catalog));
  return diagnostics;
}

function unknownTaskTypes(
  document: RulesDocument,
  catalog: RuleCatalog,
): RuleDiagnostic[] {
  return [...new Set(document.scope.task_type_ids)]
    .filter((id) => !catalog.taskTypes.some((type) => type.id === id))
    .map(() =>
      diagnostic(
        { severity: 'error', action: 'bind' },
        'unknown-task-type',
        document.id,
        'scope.task_type_ids',
      ),
    );
}

function unknownDisciplines(
  document: RulesDocument,
  catalog: RuleCatalog,
): RuleDiagnostic[] {
  return [...new Set(document.scope.discipline_ids ?? [])]
    .filter(
      (id) => !catalog.disciplines.some((discipline) => discipline.id === id),
    )
    .map(() =>
      diagnostic(
        { severity: 'error', action: 'bind' },
        'unknown-discipline',
        document.id,
        'scope.discipline_ids',
      ),
    );
}

function uncoveredTaskTypes(
  documents: readonly RulesDocument[],
  catalog: RuleCatalog,
): RuleDiagnostic[] {
  return catalog.taskTypes
    .filter(
      (type) =>
        !documents.some((document) =>
          document.scope.task_type_ids.includes(type.id),
        ),
    )
    .map((type) =>
      diagnostic(
        { severity: 'warning', action: 'bind' },
        'task-type-without-rules',
        type.id,
        'scope.task_type_ids',
      ),
    );
}

function diagnostic(
  status: Pick<RuleDiagnostic, 'severity' | 'action'>,
  code: string,
  documentId: string,
  path: string,
): RuleDiagnostic {
  return { ...status, code, documentId, path };
}

function uniqueDiagnostics(
  diagnostics: readonly RuleDiagnostic[],
): RuleDiagnostic[] {
  const unique = new Map<string, RuleDiagnostic>();
  for (const item of diagnostics) {
    unique.set(
      [item.severity, item.code, item.documentId, item.path, item.action].join(
        ':',
      ),
      item,
    );
  }
  return [...unique.values()].sort((left, right) =>
    [left.documentId, left.path, left.code]
      .join(':')
      .localeCompare([right.documentId, right.path, right.code].join(':')),
  );
}

export { effectiveRules } from './effective-rules';
export type { EffectiveRulesResult, RuleTaskScope } from './effective-rules';
export type { LintedRule } from './effective-rules';
