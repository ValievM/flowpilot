import type { DeadlineRiskResult } from '../domain/risk/risk';

export function workdayPhrase(value: number): string {
  const remainder = value % 100;
  const finalDigit = value % 10;
  const noun =
    remainder >= 11 && remainder <= 14
      ? 'рабочих дней'
      : finalDigit === 1
        ? 'рабочий день'
        : finalDigit >= 2 && finalDigit <= 4
          ? 'рабочих дня'
          : 'рабочих дней';
  return `${value.toString()} ${noun}`;
}

export function deadlineTitle(risk: DeadlineRiskResult): string | undefined {
  if (
    !risk.ok ||
    risk.risk === 'none' ||
    risk.risk === 'ok' ||
    risk.risk === 'unknown'
  )
    return undefined;
  return risk.risk === 'overdue' ? 'Срок прошёл' : 'Риск не успеть';
}

function unavailableDeadline(
  risk: Extract<DeadlineRiskResult, { ok: true }>,
): string {
  if (risk.risk === 'overdue') {
    const due = risk.due?.toLocaleString('ru-RU') ?? 'указанной дате';
    return `Дата срока — ${due}. По приблизительной оценке.`;
  }
  if (risk.startsAfterDue)
    return 'Начало назначено позже срока. По приблизительной оценке.';
  return `Осталось ${workdayPhrase(risk.available ?? 0)}, оценка остатка ${workdayPhrase(risk.estimate ?? 0)}: при этой оценке срок не выдержать. По приблизительной оценке.`;
}

export function deadlineMessage(risk: DeadlineRiskResult): string | undefined {
  if (!risk.ok || risk.risk === 'none' || risk.risk === 'ok') return undefined;
  if (risk.risk === 'unknown')
    return 'Срок есть, объём неизвестен. По приблизительной оценке.';
  if (risk.risk === 'short' || risk.risk === 'overdue')
    return unavailableDeadline(risk);
  return `До срока ${workdayPhrase(risk.available ?? 0)}, оценка остатка ${workdayPhrase(risk.estimate ?? 0)}: запас исчерпан, начинать нужно сейчас. По приблизительной оценке.`;
}
