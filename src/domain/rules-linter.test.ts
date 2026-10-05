import { describe, expect, it } from 'vitest';

import {
  canActivate,
  effectiveRules,
  lintRules,
  type RuleCatalog,
} from './rules-linter';
import type { RulesDocument } from './rules';

const catalog: RuleCatalog = {
  taskTypes: [{ id: 'lab', name: 'Лабораторная' }],
  disciplines: [{ id: 'physics', name: 'Физика' }],
};

const priorityDocument = (
  id: string,
  level: 'high' | 'normal' | 'low',
  scope: RulesDocument['scope'] = { task_type_ids: ['lab'] },
): RulesDocument => ({
  schema_version: 'v1',
  id,
  title: id,
  scope,
  rules: [{ id: `${id}-priority`, kind: 'priority', level, reason: 'Причина' }],
});

const windowDocument = (
  id: string,
  start: string,
  end: string,
  mode: 'allowed' | 'forbidden' | 'preferred' = 'allowed',
): RulesDocument => ({
  schema_version: 'v1',
  id,
  title: id,
  scope: { task_type_ids: ['lab'] },
  rules: [
    {
      id: `${id}-window`,
      kind: 'time_window',
      mode,
      days: ['monday'],
      start,
      end,
      time_zone: 'Europe/Moscow',
    },
  ],
});

describe('rules linter', () => {
  it('reports unknown task type and discipline links as activation errors', () => {
    const diagnostics = lintRules(
      [
        priorityDocument('unknown', 'high', {
          task_type_ids: ['missing'],
          discipline_ids: ['lost'],
        }),
      ],
      catalog,
    );
    expect(
      diagnostics.filter((item) => item.severity === 'error'),
    ).toHaveLength(2);
    expect(
      diagnostics
        .filter((item) => item.severity === 'error')
        .map((item) => item.action),
    ).toEqual(['bind', 'bind']);
  });

  it('warns that unbound documents are unused and excludes them from tasks', () => {
    const unbound = priorityDocument('unbound', 'high', { task_type_ids: [] });
    expect(lintRules([unbound], catalog).map((item) => item.code)).toContain(
      'unbound-document',
    );
    expect(lintRules([unbound], catalog)[0]?.action).toBe('bind');
    expect(effectiveRules({ typeId: 'lab' }, [unbound]).rules).toEqual([]);
  });

  it('blocks same-specificity priority conflicts and preserves active documents', () => {
    const current = priorityDocument('current', 'high');
    const candidate = priorityDocument('candidate', 'low');
    expect(
      lintRules([current, candidate], catalog).map((item) => item.code),
    ).toContain('priority-conflict');
    expect(canActivate(candidate, [current], catalog)).toBe(false);
    expect(
      effectiveRules({ typeId: 'lab' }, [current, candidate]).conflict,
    ).toBe(true);
    expect(
      canActivate(priorityDocument('valid', 'high'), [current], catalog),
    ).toBe(true);
    expect(
      canActivate(priorityDocument('current', 'low'), [current], catalog),
    ).toBe(true);
  });

  it('reports duplicate document IDs as activation errors', () => {
    expect(
      lintRules(
        [
          priorityDocument('same-id', 'high'),
          priorityDocument('same-id', 'high'),
        ],
        catalog,
      ).map((item) => item.code),
    ).toContain('duplicate-document-id');
  });
  it('detects conflicting rules within the same document', () => {
    const document: RulesDocument = {
      ...priorityDocument('internal', 'high'),
      rules: [
        { id: 'first', kind: 'priority', level: 'high', reason: 'Важное' },
        { id: 'second', kind: 'priority', level: 'low', reason: 'Менее важно' },
        {
          id: 'morning',
          kind: 'time_window',
          mode: 'allowed',
          days: ['monday'],
          start: '09:00',
          end: '12:00',
          time_zone: 'Europe/Moscow',
        },
        {
          id: 'afternoon',
          kind: 'time_window',
          mode: 'allowed',
          days: ['monday'],
          start: '13:00',
          end: '15:00',
          time_zone: 'Europe/Moscow',
        },
      ],
    };
    const codes = lintRules([document], catalog).map((item) => item.code);
    expect(codes).toContain('priority-conflict');
    expect(codes).toContain('time-window-conflict');
  });

  it('lets discipline-specific priority refine the type-wide priority', () => {
    const general = priorityDocument('general', 'high');
    const specific = priorityDocument('specific', 'low', {
      task_type_ids: ['lab'],
      discipline_ids: ['physics'],
    });
    const result = effectiveRules({ typeId: 'lab', disciplineId: 'physics' }, [
      general,
      specific,
    ]);
    expect(result.rules.map((rule) => rule.documentId)).toEqual([
      'general',
      'specific',
    ]);
    expect(result.documentIds).toEqual(['general', 'specific']);
  });

  it('reports an empty intersection of mandatory allowed windows', () => {
    expect(
      lintRules(
        [
          windowDocument('morning', '09:00', '12:00'),
          windowDocument('afternoon', '13:00', '15:00'),
        ],
        catalog,
      ).map((item) => item.code),
    ).toContain('time-window-conflict');
  });
  it('reports a mandatory allowed window fully excluded by a forbidden window', () => {
    expect(
      lintRules(
        [
          windowDocument('allowed', '09:00', '12:00'),
          windowDocument('forbidden', '09:00', '12:00', 'forbidden'),
        ],
        catalog,
      ).map((item) => item.code),
    ).toContain('time-window-conflict');
  });

  it('does not treat preferred windows as mandatory conflicts', () => {
    expect(
      lintRules(
        [
          windowDocument('allowed', '09:00', '12:00'),
          windowDocument('preferred', '13:00', '15:00', 'preferred'),
        ],
        catalog,
      ).map((item) => item.code),
    ).not.toContain('time-window-conflict');
  });

  it('warns when a task type has no matching rule documents', () => {
    const extraCatalog: RuleCatalog = {
      ...catalog,
      taskTypes: [...catalog.taskTypes, { id: 'essay', name: 'Эссе' }],
    };
    expect(
      lintRules([priorityDocument('lab-rule', 'high')], extraCatalog),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'task-type-without-rules',
          documentId: 'essay',
          severity: 'warning',
        }),
      ]),
    );
  });

  it('keeps type links when catalog names change because IDs are stable', () => {
    const renamed: RuleCatalog = {
      taskTypes: [{ id: 'lab', name: 'Практикум' }],
      disciplines: [{ id: 'physics', name: 'Естествознание' }],
    };
    expect(
      lintRules([priorityDocument('linked', 'high')], renamed),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown-task-type' }),
      ]),
    );
    expect(
      effectiveRules({ typeId: 'lab' }, [priorityDocument('linked', 'high')])
        .documentIds,
    ).toEqual(['linked']);
  });

  it('does not change effective output when documents are reordered', () => {
    const docs = [priorityDocument('a', 'high'), priorityDocument('b', 'high')];
    expect(effectiveRules({ typeId: 'lab' }, docs)).toEqual(
      effectiveRules({ typeId: 'lab' }, [...docs].reverse()),
    );
  });

  it('deduplicates repeated diagnostics deterministically', () => {
    const repeated = priorityDocument('duplicate', 'high', {
      task_type_ids: ['missing', 'missing'],
    });
    const diagnostics = lintRules([repeated], catalog);
    expect(
      diagnostics.filter((item) => item.code === 'unknown-task-type'),
    ).toHaveLength(1);
    expect(diagnostics).toEqual(lintRules([repeated], catalog));
  });

  it('returns an explicit no-rules result when a task has no type', () => {
    expect(effectiveRules({}, [priorityDocument('global', 'high')])).toEqual({
      rules: [],
      documentIds: [],
      conflict: false,
      reason: 'no-rules',
    });
  });
});
