import type { DeadlineRiskResult } from '../../domain/risk/risk';

export type BoardRiskCopy = {
  label: string;
  reason: string;
  isRisk: boolean;
};

export function boardRiskCopy(
  result: DeadlineRiskResult,
): BoardRiskCopy | undefined {
  if (!result.ok) return undefined;
  switch (result.risk) {
    case 'none':
    case 'ok':
      return undefined;
    case 'unknown':
      return {
        label: 'Срок есть, объём неизвестен',
        reason: 'Оценка остатка работы не указана.',
        isRisk: false,
      };
    case 'overdue':
      return {
        label: 'Срок прошёл',
        reason: 'Срок задачи уже прошёл.',
        isRisk: true,
      };
    case 'tight':
      return {
        label: 'Риск не успеть',
        reason: tightRiskReason(result),
        isRisk: true,
      };
    case 'short':
      return {
        label: 'Риск не успеть',
        reason: shortRiskReason(result),
        isRisk: true,
      };
  }
}

function tightRiskReason(
  result: Extract<DeadlineRiskResult, { ok: true }>,
): string {
  if (result.available === undefined || result.estimate === undefined)
    return '';
  return `До срока ${result.available.toString()} рабочих дн., оценка остатка ${result.estimate.toString()}: запас исчерпан. По приблизительной оценке.`;
}

function shortRiskReason(
  result: Extract<DeadlineRiskResult, { ok: true }>,
): string {
  if (result.startsAfterDue) {
    return 'Начало задачи назначено позже срока. По приблизительной оценке.';
  }
  if (result.available === undefined || result.estimate === undefined)
    return '';
  return `Осталось ${result.available.toString()} рабочих дн. при оценке остатка ${result.estimate.toString()}: срок не выдержать. По приблизительной оценке.`;
}
