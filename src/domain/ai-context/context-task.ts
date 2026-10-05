import { Temporal } from 'temporal-polyfill';
import { deadlineRisk } from '../risk/risk';
import { effectiveRules } from '../rules-linter';
import type { LintedRule } from '../rules-linter';
import type { Task } from '../task';
import type {
  ContextInput,
  ContextReferenceRule,
  ContextTask,
  EffectivePriority,
} from './context-types';
import { sanitizeUntrustedText } from './untrusted-text';

export function compareContextTasks(
  left: ContextTask,
  right: ContextTask,
): number {
  return (
    availabilityOrder(left.availability) -
      availabilityOrder(right.availability) ||
    Number(right.rules.effectivePriority?.level === 'high') -
      Number(left.rules.effectivePriority?.level === 'high') ||
    riskOrder(left.deadlineRisk) - riskOrder(right.deadlineRisk) ||
    priorityOrder(left.rules.effectivePriority?.level) -
      priorityOrder(right.rules.effectivePriority?.level) ||
    compareDeadline(left.deadline, right.deadline) ||
    left.id.localeCompare(right.id)
  );
}

export function mapContextTask(task: Task, input: ContextInput): ContextTask {
  const rules = effectiveRules(task, input.activeRules);
  const priorityRules = rules.rules.filter(
    (entry): entry is Extract<LintedRule, { rule: { kind: 'priority' } }> =>
      entry.rule.kind === 'priority',
  );
  const priority = rules.conflict ? null : selectedPriority(priorityRules);
  return {
    id: task.id,
    ...(task.typeId ? { typeId: task.typeId } : {}),
    ...(task.disciplineId ? { disciplineId: task.disciplineId } : {}),
    state: task.status.kind,
    ...(task.day ? { day: task.day.toString() } : {}),
    ...(task.time ? { time: task.time.toString() } : {}),
    ...(task.deadline ? { deadline: task.deadline.toString() } : {}),
    deadlineRisk: deadlineRisk(task, input.today, input.workdays),
    availability: availability(task, input),
    rules: {
      trust: 'untrusted',
      effectivePriority: priority,
      conflict: rules.conflict,
      reference: rules.rules.map(mapRule),
    },
    untrusted: {
      trust: 'untrusted',
      title: sanitizeUntrustedText(task.title),
      ...(task.description === undefined
        ? {}
        : { description: sanitizeUntrustedText(task.description) }),
      ...(task.status.kind === 'waiting'
        ? { waitingReason: sanitizeUntrustedText(task.status.reason) }
        : {}),
      comments: task.comments.map(({ text }) => sanitizeUntrustedText(text)),
      subtasks: task.subtasks.map(({ id, title, completed }) => ({
        id,
        title: sanitizeUntrustedText(title),
        completed,
      })),
      attachments: task.attachments.map(({ name }) => ({
        name: fileName(name),
        status: 'не прочитано',
      })),
    },
  };
}

function selectedPriority(
  priorities: readonly Extract<LintedRule, { rule: { kind: 'priority' } }>[],
): EffectivePriority | null {
  const winner = priorities.at(-1);
  return winner
    ? {
        trust: 'untrusted',
        level: winner.rule.level,
        reason: sanitizeUntrustedText(winner.rule.reason),
      }
    : null;
}

function mapRule(entry: LintedRule): ContextReferenceRule {
  const { rule } = entry;
  return {
    trust: 'untrusted',
    documentId: entry.documentId,
    id: rule.id,
    kind: rule.kind,
    summary:
      rule.kind === 'priority'
        ? `${rule.level}: ${sanitizeUntrustedText(rule.reason)}`
        : `${rule.mode}: ${rule.days.join(',')} ${rule.start}-${rule.end} ${rule.time_zone}`,
  };
}

function availability(
  task: Task,
  input: ContextInput,
): ContextTask['availability'] {
  if (task.status.kind === 'waiting') return 'waiting';
  if (task.day) {
    const dayOrder = Temporal.PlainDate.compare(task.day, input.today);
    if (dayOrder > 0) return 'future';
    if (dayOrder === 0) {
      if (
        task.time &&
        Temporal.PlainTime.compare(task.time, input.now.toPlainTime()) > 0
      )
        return 'today';
      if (task.rolledOverFrom) return 'rolled-over';
      return 'available-now';
    }
  }
  if (task.rolledOverFrom) return 'rolled-over';
  return 'future';
}

function riskOrder(risk: ContextTask['deadlineRisk']): number {
  if (!risk.ok) return 7;
  const order: Record<string, number> = {
    overdue: 0,
    short: 1,
    tight: 2,
    unknown: 3,
    ok: 4,
    none: 5,
  };
  return order[risk.risk] ?? 6;
}

function availabilityOrder(value: ContextTask['availability']): number {
  const order: Record<ContextTask['availability'], number> = {
    'available-now': 0,
    today: 1,
    'rolled-over': 2,
    waiting: 3,
    future: 4,
  };
  return order[value];
}

function priorityOrder(
  priority: EffectivePriority['level'] | undefined,
): number {
  if (priority === 'high') return 0;
  if (priority === 'normal') return 1;
  if (priority === 'low') return 2;
  return 3;
}

function compareDeadline(
  left: string | undefined,
  right: string | undefined,
): number {
  if (!left) return right ? 1 : 0;
  if (!right) return -1;
  return Temporal.PlainDate.compare(
    Temporal.PlainDate.from(left),
    Temporal.PlainDate.from(right),
  );
}

function fileName(value: string): string {
  const name = value.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
  return sanitizeUntrustedText(name);
}
