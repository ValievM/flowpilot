import { describe, expect, it, vi } from 'vitest';
import { parseRulesJson, validateRulesDocument } from './rules';

const validDocument = {
  schema_version: 'v1',
  id: 'programming-labs',
  title: 'Лабораторные по программированию',
  scope: { task_type_ids: ['lab'], discipline_ids: ['programming'] },
  rules: [
    {
      id: 'importance',
      kind: 'priority',
      level: 'high',
      reason: 'Важная причина.',
    },
  ],
  guidance: 'Сначала выяснить вопрос у преподавателя.',
};

function withTimeWindow(
  start: string,
  end: string,
  timeZone = 'Europe/Moscow',
) {
  return {
    ...validDocument,
    rules: [
      {
        id: 'study-time',
        kind: 'time_window',
        mode: 'allowed',
        days: ['monday', 'friday'],
        start,
        end,
        time_zone: timeZone,
      },
    ],
  };
}

describe('rules documents', () => {
  it('accepts the documented v1 priority example', () => {
    expect(validateRulesDocument(validDocument)).toEqual({
      ok: true,
      document: validDocument,
    });
  });

  it('reports a misspelled field with its path and a correction hint', () => {
    const result = validateRulesDocument({
      ...validDocument,
      titlle: 'Опечатка',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (error) =>
            error.path === 'titlle' &&
            error.code === 'additionalProperties' &&
            error.suggestion.length > 0,
        ),
      ).toBe(true);
    }
  });

  it('rejects additional fields', () => {
    const result = validateRulesDocument({ ...validDocument, extra: true });
    expect(result.ok).toBe(false);
  });

  it('rejects external schema references without network access', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const field of ['$schema', '$ref']) {
      const result = validateRulesDocument({
        ...validDocument,
        [field]: 'https://example.invalid/schema',
      });
      expect(result.ok).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('rejects unsupported schema versions with a version error', () => {
    const result = validateRulesDocument({
      ...validDocument,
      schema_version: 'v2',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe('enum');
  });

  it('rejects empty titles, reasons, and rule lists at their field paths', () => {
    const emptyTitle = validateRulesDocument({ ...validDocument, title: '' });
    const emptyRules = validateRulesDocument({ ...validDocument, rules: [] });
    const emptyReason = validateRulesDocument({
      ...validDocument,
      rules: [{ ...validDocument.rules[0], reason: '' }],
    });
    for (const result of [emptyTitle, emptyRules, emptyReason]) {
      expect(result.ok).toBe(false);
    }
    if (!emptyTitle.ok) expect(emptyTitle.errors[0]?.path).toBe('title');
    if (!emptyRules.ok) expect(emptyRules.errors[0]?.path).toBe('rules');
    if (!emptyReason.ok)
      expect(emptyReason.errors[0]?.path).toBe('rules[0].reason');
  });

  it('rejects duplicate rule IDs', () => {
    const result = validateRulesDocument({
      ...validDocument,
      rules: [
        validDocument.rules[0],
        { ...validDocument.rules[0], kind: 'priority' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe('duplicate-id');
  });

  it('rejects unsupported priority levels', () => {
    const result = validateRulesDocument({
      ...validDocument,
      rules: [{ ...validDocument.rules[0], level: 'urgent' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.path).toBe('rules[0].level');
  });

  it('rejects empty and reversed time windows', () => {
    for (const [start, end] of [
      ['09:00', '09:00'],
      ['11:00', '09:00'],
    ] as const) {
      const result = validateRulesDocument(withTimeWindow(start, end));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]?.path).toBe('rules[0].end');
    }
  });

  it('rejects invalid clock times and non-IANA zones', () => {
    const invalidTime = validateRulesDocument(withTimeWindow('25:00', '26:00'));
    const invalidZone = validateRulesDocument(
      withTimeWindow('09:00', '10:00', 'Mars/Phobos'),
    );
    expect(invalidTime.ok).toBe(false);
    expect(invalidZone.ok).toBe(false);
  });

  it('collects multiple validation errors without resolving external schemas', () => {
    const result = validateRulesDocument({
      ...validDocument,
      title: '',
      extra: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1);
  });

  it('returns a JSON syntax error with a source position', () => {
    const result = parseRulesJson('{');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Number.isInteger(result.error.position)).toBe(true);
  });
});
