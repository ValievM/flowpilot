import type { RulesDocument, TimeWindowRule } from './rules';

interface ConflictDiagnostic {
  readonly severity: 'error';
  readonly code: string;
  readonly documentId: string;
  readonly path: string;
  readonly action: 'resolve-conflict';
}

export function findRuleConflicts(
  documents: readonly RulesDocument[],
): ConflictDiagnostic[] {
  const result: ConflictDiagnostic[] = [];
  for (const document of documents) {
    comparePriority(document, document, result);
    compareWindows(document, document, result);
  }
  for (let leftIndex = 0; leftIndex < documents.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < documents.length;
      rightIndex += 1
    ) {
      const left = documents[leftIndex];
      const right = documents[rightIndex];
      if (!left || !right) continue;
      if (!scopesOverlap(left, right)) continue;
      if (sameSpecificity(left, right)) comparePriority(left, right, result);
      compareWindows(left, right, result);
    }
  }
  return result;
}

function comparePriority(
  left: RulesDocument,
  right: RulesDocument,
  result: ConflictDiagnostic[],
): void {
  for (const a of left.rules) {
    if (a.kind !== 'priority') continue;
    for (const b of right.rules) {
      if (b.kind === 'priority' && a.level !== b.level) {
        result.push(
          ...conflict(left.id, right.id, 'priority-conflict', 'rules'),
        );
      }
    }
  }
}

function compareWindows(
  left: RulesDocument,
  right: RulesDocument,
  result: ConflictDiagnostic[],
): void {
  for (const a of left.rules) {
    if (a.kind !== 'time_window') continue;
    for (const b of right.rules) {
      if (b.kind !== 'time_window') continue;
      if (emptyAllowedIntersection(a, b)) {
        result.push(
          ...conflict(left.id, right.id, 'time-window-conflict', 'rules'),
        );
      }
    }
  }
}

function emptyAllowedIntersection(
  left: TimeWindowRule,
  right: TimeWindowRule,
): boolean {
  if (left.mode === 'allowed' && right.mode === 'allowed') {
    return emptyIntersection(left, right);
  }
  if (left.mode === 'allowed' && right.mode === 'forbidden') {
    return forbiddenCoversAllowed(left, right);
  }
  return (
    right.mode === 'allowed' &&
    left.mode === 'forbidden' &&
    forbiddenCoversAllowed(right, left)
  );
}

function forbiddenCoversAllowed(
  allowed: TimeWindowRule,
  forbidden: TimeWindowRule,
): boolean {
  return (
    allowed.time_zone === forbidden.time_zone &&
    allowed.days.every((day) => forbidden.days.includes(day)) &&
    forbidden.start <= allowed.start &&
    forbidden.end >= allowed.end
  );
}

function emptyIntersection(
  left: TimeWindowRule,
  right: TimeWindowRule,
): boolean {
  if (left.time_zone !== right.time_zone) return false;
  if (!left.days.some((day) => right.days.includes(day))) return true;
  return left.end <= right.start || right.end <= left.start;
}

function scopesOverlap(left: RulesDocument, right: RulesDocument): boolean {
  const sharedType = left.scope.task_type_ids.some((id) =>
    right.scope.task_type_ids.includes(id),
  );
  if (!sharedType) return false;
  const leftIds = left.scope.discipline_ids ?? [];
  const rightIds = right.scope.discipline_ids ?? [];
  return (
    leftIds.length === 0 ||
    rightIds.length === 0 ||
    leftIds.some((id) => rightIds.includes(id))
  );
}

function sameSpecificity(left: RulesDocument, right: RulesDocument): boolean {
  return (
    Boolean(left.scope.discipline_ids?.length) ===
    Boolean(right.scope.discipline_ids?.length)
  );
}

function conflict(
  leftId: string,
  rightId: string,
  code: string,
  path: string,
): ConflictDiagnostic[] {
  return [leftId, rightId].map((documentId) => ({
    severity: 'error',
    code,
    documentId,
    path,
    action: 'resolve-conflict',
  }));
}
