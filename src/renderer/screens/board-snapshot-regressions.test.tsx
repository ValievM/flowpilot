import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcSnapshot } from '../../shared/contracts';
import { createBoardApi, renderBoard, snapshot, task } from './board-test-data';
import { useBoardSnapshot } from './use-board-snapshot';

afterEach(cleanup);

describe('board snapshot reloads', () => {
  it('does not replace a fresh snapshot when an older load resolves later', async () => {
    const api = createBoardApi();
    api.loadMock.mockResolvedValueOnce({ ok: false, error: 'InternalError' });
    const pending: Array<(value: IpcSnapshot) => void> = [];
    api.loadMock.mockImplementation(() => deferredLoad(pending));
    renderBoard(api);
    await screen.findByRole('alert');

    screen.getByRole('button', { name: 'Повторить' }).click();
    screen.getByRole('button', { name: 'Повторить' }).click();
    await waitFor(() => {
      expect(pending).toHaveLength(2);
    });

    const fresh = {
      ...snapshot([task('task', 'done', 'Свежая версия')]),
      revision: 3,
    };
    await act(async () => {
      pending[1]?.(fresh);
      await Promise.resolve();
    });
    expect(
      await screen.findByRole('heading', { name: 'Свежая версия' }),
    ).toBeVisible();

    const stale = {
      ...snapshot([task('task', 'todo', 'Устаревшая версия')]),
      revision: 1,
    };
    await act(async () => {
      pending[0]?.(stale);
      await Promise.resolve();
    });
    expect(
      screen.getByRole('heading', { name: 'Свежая версия' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Устаревшая версия' }),
    ).not.toBeInTheDocument();
  });

  it('does not announce an older overlapping refresh as shown before the latest result arrives', async () => {
    const api = createBoardApi();
    api.loadMock.mockResolvedValueOnce({ ok: true, value: snapshot() });
    api.applyMock.mockResolvedValue({ ok: false, error: 'StaleRevision' });
    const pending: Array<(value: IpcSnapshot) => void> = [];
    api.loadMock.mockImplementation(() => deferredLoad(pending));
    window.flowpilot = api;

    function SnapshotProbe(): React.JSX.Element {
      const board = useBoardSnapshot();
      return (
        <>
          <h1>{board.snapshot?.tasks[0]?.title}</h1>
          <output>{board.notice}</output>
          <button
            onClick={() => {
              void board.apply([]);
            }}
          >
            Apply
          </button>
          <button
            onClick={() => {
              void board.load();
            }}
          >
            Refresh
          </button>
        </>
      );
    }

    render(<SnapshotProbe />);
    await screen.findByRole('heading', { name: 'Написать отчёт' });
    screen.getByRole('button', { name: 'Apply' }).click();
    await waitFor(() => {
      expect(pending).toHaveLength(1);
    });
    screen.getByRole('button', { name: 'Refresh' }).click();
    await waitFor(() => {
      expect(pending).toHaveLength(2);
    });

    await act(async () => {
      pending[0]?.(snapshot([task('task', 'todo', 'Старая версия')]));
      await Promise.resolve();
    });
    expect(
      screen.queryByText(/Показаны актуальные данные/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Написать отчёт' }),
    ).toBeVisible();

    await act(async () => {
      pending[1]?.(snapshot([task('task', 'todo', 'Новая версия')]));
      await Promise.resolve();
    });
    expect(
      await screen.findByRole('heading', { name: 'Новая версия' }),
    ).toBeVisible();
  });
});

function deferredLoad(
  pending: Array<(value: IpcSnapshot) => void>,
): Promise<{ ok: true; value: IpcSnapshot }> {
  return new Promise((resolve) => {
    pending.push((value) => {
      resolve({ ok: true, value });
    });
  });
}
