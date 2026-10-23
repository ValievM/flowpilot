import type { RuleDiagnostic, RulesValidationError } from '../domain';

export type RuleValidationIssue = Pick<
  RulesValidationError,
  'path' | 'reason'
> & {
  readonly code: string;
  readonly suggestion: string;
};

export function validationIssues(
  diagnostics: readonly RuleDiagnostic[],
): RuleValidationIssue[] {
  return diagnostics.map(({ code, path, action }) => ({
    code,
    path,
    reason: `Правило конфликтует с каталогом: ${code}.`,
    suggestion: `Исправьте область правила: ${action}.`,
  }));
}
