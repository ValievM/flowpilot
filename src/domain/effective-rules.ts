import type { RulesDocument, PriorityRule, TimeWindowRule } from './rules';
import { findRuleConflicts } from './rules-conflicts';

export type LintedRule =
  | { readonly documentId: string; readonly rule: PriorityRule }
  | { readonly documentId: string; readonly rule: TimeWindowRule };

export interface RuleTaskScope {
  readonly typeId?: string;
  readonly disciplineId?: string;
}

export interface EffectiveRulesResult {
  readonly rules: readonly LintedRule[];
  readonly documentIds: readonly string[];
  readonly conflict: boolean;
  readonly reason: 'no-rules' | 'conflict' | 'rules';
}

export function effectiveRules(
  task: RuleTaskScope,
  activeDocuments: readonly RulesDocument[],
): EffectiveRulesResult {
  if (!task.typeId) return emptyResult();
  const matching = activeDocuments.filter((document) =>
    matchesScope(document, task),
  );
  if (matching.length === 0) return emptyResult();
  const priorities = selectPriorities(matching);
  const rules: LintedRule[] = [...priorities, ...selectWindows(matching)];
  const documentIds = [
    ...new Set(rules.map((entry) => entry.documentId)),
  ].sort();
  const conflict = findRuleConflicts(matching).some((item) =>
    documentIds.includes(item.documentId),
  );
  return {
    rules,
    documentIds,
    conflict,
    reason: conflict ? 'conflict' : 'rules',
  };
}

function matchesScope(document: RulesDocument, task: RuleTaskScope): boolean {
  if (!document.scope.task_type_ids.includes(task.typeId ?? '')) return false;
  const disciplines = document.scope.discipline_ids ?? [];
  return (
    disciplines.length === 0 ||
    (task.disciplineId !== undefined && disciplines.includes(task.disciplineId))
  );
}

function selectPriorities(documents: readonly RulesDocument[]): LintedRule[] {
  return documents
    .flatMap((document) =>
      document.rules
        .filter((rule): rule is PriorityRule => rule.kind === 'priority')
        .map((rule) => ({
          documentId: document.id,
          rule,
          specificity: specificity(document),
        })),
    )
    .sort(
      (left, right) =>
        left.specificity - right.specificity || byDocumentAndRule(left, right),
    )
    .map(({ documentId, rule }) => ({ documentId, rule }));
}

function selectWindows(documents: readonly RulesDocument[]): LintedRule[] {
  return documents
    .flatMap((document) =>
      document.rules
        .filter((rule): rule is TimeWindowRule => rule.kind === 'time_window')
        .map((rule) => ({ documentId: document.id, rule })),
    )
    .sort(byDocumentAndRule);
}

function specificity(document: RulesDocument): number {
  return document.scope.discipline_ids?.length ? 1 : 0;
}

function byDocumentAndRule(left: LintedRule, right: LintedRule): number {
  return `${left.documentId}:${left.rule.id}`.localeCompare(
    `${right.documentId}:${right.rule.id}`,
  );
}

function emptyResult(): EffectiveRulesResult {
  return { rules: [], documentIds: [], conflict: false, reason: 'no-rules' };
}
