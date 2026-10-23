import { describe, expect, it } from 'vitest';
import { describeChanges, formatValue } from './chat-copy';

const change = (field: string, before: unknown, after: unknown) => ({
  commandIndex: 0,
  entityId: 'task-1',
  field,
  before,
  after,
});

describe('chat diff wording', () => {
  it('hides internal fields of a new card and keeps what the person asked for', () => {
    const rows = describeChanges([
      change('id', null, 'ai-task-1'),
      change('title', null, 'Подготовить доклад'),
      change('day', null, '2026-10-09'),
      change('columnId', null, 'todo'),
      change('status', null, { kind: 'todo' }),
      change('subtasks', null, []),
      change('comments', null, []),
      change('attachments', null, []),
      change('addedOrder', null, 0),
    ]);

    expect(rows.map(({ label, after }) => [label, after])).toEqual([
      ['Название', 'Подготовить доклад'],
      ['День', '09.10.2026'],
    ]);
  });

  it('lists subtasks by title instead of raw data', () => {
    const rows = describeChanges([
      change(
        'subtasks',
        [],
        [
          { id: 's1', title: 'Собрать источники', completed: false },
          { id: 's2', title: 'Написать план', completed: false },
        ],
      ),
    ]);

    expect(rows).toEqual([
      {
        key: '0-subtasks',
        label: 'Подзадачи',
        before: '—',
        after: 'Собрать источники; Написать план',
      },
    ]);
  });

  it('keeps a move of an existing card visible, in words', () => {
    const rows = describeChanges([
      change('columnId', 'todo', 'doing'),
      change('status', { kind: 'todo' }, { kind: 'doing' }),
      change('status', { kind: 'doing' }, { kind: 'waiting', reason: 'Ответ' }),
    ]);

    expect(
      rows.map(({ label, before, after }) => [label, before, after]),
    ).toEqual([
      ['Колонка', 'Сделать', 'Делаю'],
      ['Статус', 'Сделать', 'Делаю'],
      ['Статус', 'Делаю', 'Ожидание: Ответ'],
    ]);
  });

  it('writes dates the way the lists do and empties as a dash', () => {
    expect(formatValue('2026-10-09')).toBe('09.10.2026');
    expect(formatValue(null)).toBe('—');
    expect(formatValue('')).toBe('—');
  });
});
