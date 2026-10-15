import { describe, expect, it } from 'vitest';
import type { IpcHistoryEntry } from '../shared/contracts';
import { historyEntryText, historyTaskId } from './history-copy';

const entry = (
  kind: string,
  before: unknown,
  after: unknown,
): IpcHistoryEntry => ({
  id: 'entry-1',
  revision: 1,
  occurredAt: '2026-10-05T12:00:00Z',
  source: 'user',
  batchId: 'batch-1',
  undoneEntryId: null,
  entities: [{ kind, id: 'task-1', before, after, versionAfter: 1 }],
});

describe('history entry copy', () => {
  it('describes task title changes and returns their card id', () => {
    const value = entry('task', { title: 'Старое' }, { title: 'Новое' });
    expect(historyEntryText(value)).toBe('Карточка. Название: «Новое»');
    expect(historyTaskId(value)).toBe('task-1');
  });

  it('uses neutral copy for unknown entry kinds', () => {
    expect(historyEntryText(entry('future-kind', {}, {}))).toBe(
      'Изменение данных',
    );
  });

  it('handles records without affected entities', () => {
    expect(historyEntryText({ ...entry('task', {}, {}), entities: [] })).toBe(
      'Изменение данных',
    );
    expect(
      historyTaskId({ ...entry('task', {}, {}), entities: [] }),
    ).toBeUndefined();
  });
});
