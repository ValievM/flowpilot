import type { RemainingEstimate } from './task';

export type RemainingEstimateResult =
  | { ok: true; value: RemainingEstimate }
  | { ok: false; error: 'not-integer' | 'below-one' };

export function createRemainingEstimate(
  value: number,
): RemainingEstimateResult {
  if (!Number.isInteger(value)) return { ok: false, error: 'not-integer' };
  if (value < 1) return { ok: false, error: 'below-one' };
  return { ok: true, value: { unit: 'workdays', value } };
}
