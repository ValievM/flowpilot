import { describe, expect, it } from 'vitest';
import { taskCountPhrase } from './today-copy';

describe('Today task count copy', () => {
  it.each([
    [1, '1 дело'],
    [2, '2 дела'],
    [4, '4 дела'],
    [5, '5 дел'],
    [11, '11 дел'],
    [21, '21 дело'],
  ])('uses the correct form for %i tasks', (count, expected) => {
    expect(taskCountPhrase(count)).toBe(expected);
  });
});
