import { createRef } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcHistoryEntry } from '../../shared/contracts';
import { HistoryPanel } from './history-panel';
import type { UndoOutcome } from '../use-history';

const records: readonly IpcHistoryEntry[] = [
  {
    id: 'newer',
    revision: 2,
    occurredAt: '2026-10-05T12:00:00Z',
    source: 'user',
    batchId: 'b2',
    undoneEntryId: 'older',
    entities: [
      {
        kind: 'task',
        id: 'task-1',
        before: { title: 'Старое' },
        after: { title: 'Новое' },
        versionAfter: 2,
      },
    ],
  },
  {
    id: 'older',
    revision: 1,
    occurredAt: '2026-10-05T11:00:00Z',
    source: 'user',
    batchId: 'b1',
    undoneEntryId: null,
    entities: [
      {
        kind: 'task',
        id: 'task-1',
        before: null,
        after: { title: 'Старое' },
        versionAfter: 1,
      },
    ],
  },
];

function renderPanel(
  entries = records,
  onUndo: (entryId: string) => Promise<UndoOutcome> = vi.fn(() =>
    Promise.resolve('UndoConflict' as const),
  ),
) {
  const triggerRef = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  render(
    <>
      <button ref={triggerRef}>История</button>
      <HistoryPanel
        open
        entries={entries}
        tasks={[{ id: 'task-1', title: 'Карточка тест' }]}
        loading={false}
        error={undefined}
        onClose={onClose}
        onUndo={onUndo}
        triggerRef={triggerRef}
      />
    </>,
  );
  return { onClose, onUndo, triggerRef };
}

describe('history panel', () => {
  afterEach(cleanup);
  it('shows entries newest first with affected card titles and accessible actions', () => {
    renderPanel();
    const items = screen.getByRole('list', {
      name: 'Записи истории от новых к старым',
    });
    expect(within(items).getAllByRole('listitem')).toHaveLength(2);
    expect(within(items).getAllByText('Карточка: Карточка тест')).toHaveLength(
      2,
    );
    expect(
      within(items).getAllByRole('button', { name: /Отменить:/ }),
    ).toHaveLength(2);
    expect(
      within(items)
        .getAllByRole('button', { name: /Отменить:/ })[1]
        ?.hasAttribute('disabled'),
    ).toBe(true);
  });

  it('explains undo conflict without hiding changed cards', async () => {
    const { onUndo } = renderPanel();
    const action = screen.getAllByRole('button', { name: /Отменить:/ })[0];
    if (!action) throw new Error('Missing undo button');
    fireEvent.click(action);
    expect(onUndo).toHaveBeenCalledWith('newer');
    expect(
      await screen.findByText(
        'Карточка изменена позже. Новые данные сохранены.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('list', { name: 'Карточки, изменённые позже' })
        .textContent,
    ).toContain('Карточка тест');
  });

  it('uses the selected older entry id for undo', async () => {
    const older = records[1];
    if (!older) throw new Error('Missing older history record');
    const onUndo = vi.fn(() => Promise.resolve('ok' as const));
    renderPanel([older], onUndo);
    const button = screen.getByRole('button', { name: /Отменить:/ });
    fireEvent.click(button);
    expect(onUndo).toHaveBeenCalledWith('older');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Отменено: Карточка. Создана: «Старое»',
    );
  });

  it('disables entries reported as not undoable', async () => {
    const older = records[1];
    if (!older) throw new Error('Missing older history record');
    const onUndo = vi.fn(() => Promise.resolve('NotUndoable' as const));
    renderPanel([older], onUndo);
    const button = screen.getByRole('button', { name: /Отменить:/ });
    fireEvent.click(button);
    expect(await screen.findByText('Эту запись нельзя отменить.')).toBeTruthy();
    expect(button).toBeDisabled();
  });
  it('shows an empty history message', () => {
    renderPanel([]);
    expect(screen.getByText('История пока пуста.')).toBeTruthy();
  });

  it('closes on Escape and returns focus to the invoking button', async () => {
    const { onClose, triggerRef } = renderPanel();
    fireEvent(
      screen.getByRole('dialog', { name: 'История' }),
      new Event('cancel', { bubbles: false, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(document.activeElement).toBe(triggerRef.current);
    });
  });
});
