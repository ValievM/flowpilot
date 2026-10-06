import { describe, expect, it } from 'vitest';
import { workdayPhrase } from './deadline-copy';

describe('workdayPhrase', () => {
  it.each([
    [1, '1 рабочий день'],
    [2, '2 рабочих дня'],
    [5, '5 рабочих дней'],
  ])('uses the correct Russian form for %i workdays', (value, expected) => {
    expect(workdayPhrase(value)).toBe(expected);
  });
});
