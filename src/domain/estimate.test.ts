import { describe, expect, it } from 'vitest';
import { createRemainingEstimate } from './index';

describe('createRemainingEstimate', () => {
  it('accepts positive whole workday counts', () => {
    expect(createRemainingEstimate(1)).toEqual({
      ok: true,
      value: { unit: 'workdays', value: 1 },
    });
    expect(createRemainingEstimate(2.0)).toEqual({
      ok: true,
      value: { unit: 'workdays', value: 2 },
    });
  });

  it('distinguishes invalid numeric forms from counts below one', () => {
    for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(createRemainingEstimate(value)).toEqual({
        ok: false,
        error: 'not-integer',
      });
    }
    for (const value of [-1, 0]) {
      expect(createRemainingEstimate(value)).toEqual({
        ok: false,
        error: 'below-one',
      });
    }
  });
});
