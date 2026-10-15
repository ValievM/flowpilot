import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { lintRules, parseRulesJson, validateRulesDocument } from '../domain';
import type {
  RuleDiagnostic,
  RulesDocument,
  RulesValidationError,
} from '../domain';
import type { Repository, StoredRule, StorageCommand } from '../storage';
import type { Snapshot } from '../storage';
import { z } from 'zod';

type RuleError =
  | { readonly kind: 'ValidationFailed' }
  | { readonly kind: 'Cancelled' }
  | { readonly kind: 'NotFound' }
  | { readonly kind: 'RuleConflict' }
  | { readonly kind: 'InternalError' }
  | {
      readonly kind: 'RuleInvalid';
      readonly errors: readonly RuleValidationIssue[];
    };

type RuleValidationIssue = Pick<RulesValidationError, 'path' | 'reason'> & {
  readonly code: string;
  readonly suggestion: string;
};
type RuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuleError };
export type RuleFileDependencies = {
  readonly repository: Repository;
  readonly dialogs: {
    openRulesFile(): Promise<string | undefined>;
    saveRulesFile(): Promise<string | undefined>;
  };
  readonly files?: {
    size(path: string): number;
    read(path: string): string;
    write(path: string, content: string): void;
  };
};

const emptyRequestSchema = z.object({}).strict();
const exportRequestSchema = z.object({ id: z.string().min(1) }).strict();
const MAX_RULE_FILE_BYTES = 1_048_576;

export async function importRuleFile(
  request: unknown,
  deps: RuleFileDependencies,
): Promise<RuleResult<StoredRule>> {
  if (!emptyRequestSchema.safeParse(request).success)
    return { ok: false, error: { kind: 'ValidationFailed' } };
  const selectedPath = await deps.dialogs.openRulesFile();
  if (!selectedPath) return { ok: false, error: { kind: 'Cancelled' } };
  if (extname(selectedPath).toLowerCase() !== '.json')
    return { ok: false, error: { kind: 'ValidationFailed' } };
  try {
    const files = deps.files ?? nodeFiles;
    if (files.size(selectedPath) > MAX_RULE_FILE_BYTES)
      return { ok: false, error: { kind: 'ValidationFailed' } };
    const documentJson = files.read(selectedPath);
    const snapshot = deps.repository.load();
    const checked = validateRuleFile(documentJson, snapshot);
    const applied = deps.repository.apply(
      [{ kind: 'rule.import', documentJson }],
      snapshot.revision,
    );
    if (!applied.ok) return { ok: false, error: { kind: 'InternalError' } };
    if (!checked.ok) return checked;
    const rule = deps.repository
      .load()
      .rules.find(({ id }) => id === checked.value.id);
    return rule
      ? { ok: true, value: rule }
      : { ok: false, error: { kind: 'InternalError' } };
  } catch {
    return { ok: false, error: { kind: 'InternalError' } };
  }
}

function validateRuleFile(
  documentJson: string,
  snapshot: Snapshot,
): RuleResult<RulesDocument> {
  const parsedJson = parseRulesJson(documentJson);
  if (!parsedJson.ok) {
    return {
      ok: false,
      error: {
        kind: 'RuleInvalid',
        errors: [
          {
            path: `@${String(parsedJson.error.position)}`,
            code: parsedJson.error.code,
            reason: parsedJson.error.reason,
            suggestion: parsedJson.error.suggestion,
          },
        ],
      },
    };
  }
  const validated = validateRulesDocument(parsedJson.value);
  if (!validated.ok)
    return {
      ok: false,
      error: { kind: 'RuleInvalid', errors: validated.errors },
    };
  const diagnostics = lintRules([validated.document], {
    taskTypes: snapshot.taskTypes,
    disciplines: snapshot.disciplines,
  });
  const conflicts = diagnostics.filter(({ severity }) => severity === 'error');
  return conflicts.length > 0
    ? {
        ok: false,
        error: { kind: 'RuleInvalid', errors: validationIssues(conflicts) },
      }
    : { ok: true, value: validated.document };
}

export async function exportRuleFile(
  request: unknown,
  deps: RuleFileDependencies,
): Promise<RuleResult<null>> {
  const parsed = exportRequestSchema.safeParse(request);
  if (!parsed.success)
    return { ok: false, error: { kind: 'ValidationFailed' } };
  const rule = deps.repository
    .load()
    .rules.find(({ id }) => id === parsed.data.id);
  if (!rule?.activeDocument) return { ok: false, error: { kind: 'NotFound' } };
  const selectedPath = await deps.dialogs.saveRulesFile();
  if (!selectedPath) return { ok: false, error: { kind: 'Cancelled' } };
  if (extname(selectedPath).toLowerCase() !== '.json')
    return { ok: false, error: { kind: 'ValidationFailed' } };
  try {
    (deps.files ?? nodeFiles).write(
      selectedPath,
      JSON.stringify(rule.activeDocument, null, 2),
    );
    return { ok: true, value: null };
  } catch {
    return { ok: false, error: { kind: 'InternalError' } };
  }
}
export function listCatalogs(
  request: unknown,
  deps: Pick<RuleFileDependencies, 'repository'>,
): RuleResult<Pick<Snapshot, 'taskTypes' | 'disciplines'>> {
  if (!emptyRequestSchema.safeParse(request).success)
    return { ok: false, error: { kind: 'ValidationFailed' } };
  try {
    const { taskTypes, disciplines } = deps.repository.load();
    return { ok: true, value: { taskTypes, disciplines } };
  } catch {
    return { ok: false, error: { kind: 'InternalError' } };
  }
}

export function listRules(
  request: unknown,
  deps: Pick<RuleFileDependencies, 'repository'>,
): RuleResult<Snapshot['rules']> {
  if (!emptyRequestSchema.safeParse(request).success)
    return { ok: false, error: { kind: 'ValidationFailed' } };
  try {
    return { ok: true, value: deps.repository.load().rules };
  } catch {
    return { ok: false, error: { kind: 'InternalError' } };
  }
}

export function activateRule(
  request: unknown,
  deps: Pick<RuleFileDependencies, 'repository'>,
): RuleResult<StoredRule> {
  const parsed = exportRequestSchema.safeParse(request);
  if (!parsed.success)
    return { ok: false, error: { kind: 'ValidationFailed' } };
  return applyRuleCommand(
    { kind: 'rule.activate', ruleId: parsed.data.id },
    parsed.data.id,
    deps.repository,
  );
}

export function deactivateRule(
  request: unknown,
  deps: Pick<RuleFileDependencies, 'repository'>,
): RuleResult<StoredRule> {
  const parsed = exportRequestSchema.safeParse(request);
  if (!parsed.success)
    return { ok: false, error: { kind: 'ValidationFailed' } };
  return applyRuleCommand(
    { kind: 'rule.deactivate', ruleId: parsed.data.id },
    parsed.data.id,
    deps.repository,
  );
}

export function bindRule(
  request: unknown,
  deps: Pick<RuleFileDependencies, 'repository'>,
): RuleResult<StoredRule> {
  const parsed = z
    .object({
      id: z.string().min(1),
      scope: z
        .object({
          task_type_ids: z.array(z.string().min(1)),
          discipline_ids: z.array(z.string().min(1)).optional(),
        })
        .strict(),
    })
    .strict()
    .safeParse(request);
  if (!parsed.success)
    return { ok: false, error: { kind: 'ValidationFailed' } };
  return applyRuleCommand(
    {
      kind: 'rule.bind',
      ruleId: parsed.data.id,
      scope: {
        task_type_ids: parsed.data.scope.task_type_ids,
        ...(parsed.data.scope.discipline_ids !== undefined
          ? { discipline_ids: parsed.data.scope.discipline_ids }
          : {}),
      },
    },
    parsed.data.id,
    deps.repository,
  );
}

function applyRuleCommand(
  command: StorageCommand,
  id: string,
  repository: Repository,
): RuleResult<StoredRule> {
  try {
    const before = repository.load();
    const applied = repository.apply([command], before.revision);
    if (!applied.ok) {
      if (applied.error.kind === 'StaleRevision')
        return { ok: false, error: { kind: 'RuleConflict' } };
      return {
        ok: false,
        error:
          applied.error.message === 'Rule cannot be activated'
            ? { kind: 'RuleConflict' }
            : { kind: 'ValidationFailed' },
      };
    }
    const rule = repository
      .load()
      .rules.find((candidate) => candidate.id === id);
    return rule
      ? { ok: true, value: rule }
      : { ok: false, error: { kind: 'NotFound' } };
  } catch {
    return { ok: false, error: { kind: 'InternalError' } };
  }
}
function validationIssues(
  diagnostics: readonly RuleDiagnostic[],
): RuleValidationIssue[] {
  return diagnostics.map(({ code, path, action }) => ({
    code,
    path,
    reason: `Правило конфликтует с каталогом: ${code}.`,
    suggestion: `Исправьте область правила: ${action}.`,
  }));
}

const nodeFiles = {
  size: (path: string) => statSync(path).size,
  read: (path: string) => readFileSync(path, 'utf8'),
  write: (path: string, content: string) => {
    writeFileSync(path, content, 'utf8');
  },
};
