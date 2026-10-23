import type { RulesDocument } from '../../domain/rules';
import type { IpcRuleIssue, IpcStoredRule } from '../../shared/rule-contracts';

type Diagnostic = IpcStoredRule['diagnostics'][number];

const days: Readonly<Record<string, string>> = {
  monday: 'пн',
  tuesday: 'вт',
  wednesday: 'ср',
  thursday: 'чт',
  friday: 'пт',
  saturday: 'сб',
  sunday: 'вс',
};
const levels: Readonly<Record<string, string>> = {
  high: 'высокая',
  normal: 'обычная',
  low: 'низкая',
};
const modes: Readonly<Record<string, string>> = {
  allowed: 'разрешено',
  forbidden: 'запрещено',
  preferred: 'предпочтительно',
};

/** What the person sees: the active version, or the latest draft while the document is not active. */
export function currentDocument(rule: IpcStoredRule): RulesDocument | null {
  return rule.status === 'active'
    ? (rule.activeDocument ?? rule.document)
    : (rule.document ?? rule.activeDocument);
}

export function ruleTitle(rule: IpcStoredRule): string {
  return currentDocument(rule)?.title ?? rule.id;
}

/**
 * `activeDocument` is the accepted version the app really uses. A draft next to it
 * (a rebind, or an import that failed the checks) waits for activation and changes nothing yet.
 */
export function statusText(rule: IpcStoredRule): string {
  if (rule.activeDocument) {
    if (rule.status === 'active') return 'Активно';
    return rule.errors.length > 0
      ? 'Активно · новая версия не прошла проверку'
      : 'Активно · есть черновик';
  }
  return rule.errors.length > 0 ? 'Не прошло проверку' : 'Черновик';
}

export function ruleCountText(count: number): string {
  const rest = count % 100;
  const last = count % 10;
  const noun =
    rest >= 11 && rest <= 14
      ? 'правил'
      : last === 1
        ? 'правило'
        : last >= 2 && last <= 4
          ? 'правила'
          : 'правил';
  return `${String(count)} ${noun}`;
}

/** A rule as one plain sentence. */
export function ruleSentence(rule: RulesDocument['rules'][number]): string {
  if (rule.kind === 'priority')
    return `Важность: ${levels[rule.level] ?? rule.level} — ${rule.reason}`;
  const names = rule.days.map((day) => days[day] ?? day).join(', ');
  return `Окно времени: ${modes[rule.mode] ?? rule.mode} · ${names} · ${rule.start}–${rule.end}`;
}

const diagnosticWords: Readonly<
  Record<string, { title: string; text: string }>
> = {
  'unbound-document': {
    title: 'Нет привязки',
    text: 'Документ не влияет на задачи, пока не выбран тип.',
  },
  'unknown-task-type': {
    title: 'Неизвестный тип',
    text: 'Документ привязан к типу, которого уже нет. Выберите существующий.',
  },
  'unknown-discipline': {
    title: 'Неизвестная дисциплина',
    text: 'Документ привязан к дисциплине, которой уже нет. Выберите существующую.',
  },
  'duplicate-document-id': {
    title: 'Повторяется идентификатор',
    text: 'Два документа используют один идентификатор. Измените его в файле.',
  },
  'priority-conflict': {
    title: 'Конфликт важности',
    text: 'Два активных документа по-разному задают важность для одних и тех же задач.',
  },
  'time-window-conflict': {
    title: 'Конфликт окон времени',
    text: 'Два активных документа по-разному задают окна времени для одних и тех же задач.',
  },
};

export function diagnosticWordsFor(diagnostic: Diagnostic): {
  title: string;
  text: string;
} {
  return (
    diagnosticWords[diagnostic.code] ?? {
      title: 'Требует внимания',
      text: `Проверка нашла проблему: ${diagnostic.code}.`,
    }
  );
}

export function issueText(issue: IpcRuleIssue): string {
  return `${issue.path}: ${issue.reason} ${issue.suggestion}`.trim();
}
