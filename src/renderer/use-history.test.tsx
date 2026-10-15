import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcHistoryEntry } from '../shared/contracts';
import { fakeApi } from './test-support/fake-flowpilot';
import { useHistory } from './use-history';

const historyEntry: IpcHistoryEntry = {
  id: 'entry-1',
  revision: 1,
  occurredAt: '2026-10-05T12:00:00Z',
  source: 'user',
  batchId: 'batch-1',
  undoneEntryId: null,
  entities: [
    {
      kind: 'task',
      id: 'task-1',
      before: { title: 'Старое' },
      after: { title: 'Новое' },
      versionAfter: 1,
    },
  ],
};

afterEach(cleanup);

function mountHistory(fake = fakeApi([], () => '2026-10-05T12:00:00Z')) {
  Object.defineProperty(window, 'flowpilot', {
    configurable: true,
    value: fake.api,
  });
  const refreshSnapshot = vi.fn(() => Promise.resolve(undefined));
  function Harness() {
    const history = useHistory(refreshSnapshot);
    return (
      <>
        <input aria-label="Поле текста" />
        <button
          onClick={() => {
            void history.undo();
          }}
        >
          Отменить
        </button>
        <output>{history.entries.map(({ id }) => id).join(',')}</output>
        <p>{history.notice}</p>
      </>
    );
  }
  render(<Harness />);
  return { fake, refreshSnapshot };
}
describe('history undo shortcuts', () => {
  it('undoes the latest record with Cmd+Z and refreshes saved data', async () => {
    const fake = fakeApi([], () => '2026-10-05T12:00:00Z');
    vi.spyOn(fake.api.history, 'list').mockResolvedValue({
      ok: true,
      value: [historyEntry],
    });
    const undo = vi.spyOn(fake.api.history, 'undo').mockResolvedValue({
      ok: true,
      value: fake.snapshot(),
    });
    const { refreshSnapshot } = mountHistory(fake);
    await waitFor(() => {
      expect(screen.getByText('entry-1')).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => {
      expect(undo).toHaveBeenCalledWith(undefined);
    });
    expect(refreshSnapshot).toHaveBeenCalled();
    expect(
      await screen.findByText('Отменено: Карточка. Название: «Новое»'),
    ).toBeTruthy();
  });

  it('leaves Cmd+Z to the focused text editor', () => {
    const fake = fakeApi([], () => '2026-10-05T12:00:00Z');
    const undo = vi.spyOn(fake.api.history, 'undo');
    mountHistory(fake);
    const input = screen.getByRole('textbox', { name: 'Поле текста' });
    input.focus();
    fireEvent.keyDown(input, { key: 'z', metaKey: true });
    expect(undo).not.toHaveBeenCalled();
  });
});
