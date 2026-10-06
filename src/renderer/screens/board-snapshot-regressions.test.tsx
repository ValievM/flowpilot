import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcSnapshot } from '../../shared/contracts';
import { createBoardApi, renderBoard, snapshot, task } from './board-test-data';

afterEach(cleanup);

describe('board snapshot reloads', () => {
  it('does not replace a fresh snapshot when an older load resolves later', async () => {
    const api = createBoardApi();
    api.loadMock.mockResolvedValueOnce({ ok: false, error: 'InternalError' });
    const pending: Array<(value: IpcSnapshot) => void> = [];
    api.loadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push((value) => {
            resolve({ ok: true, value });
          });
        }),
    );
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
    act(() => {
      pending[1]?.(fresh);
    });
    expect(
      await screen.findByRole('heading', { name: 'Свежая версия' }),
    ).toBeVisible();

    const stale = {
      ...snapshot([task('task', 'todo', 'Устаревшая версия')]),
      revision: 1,
    };
    act(() => {
      pending[0]?.(stale);
    });
    expect(
      screen.getByRole('heading', { name: 'Свежая версия' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Устаревшая версия' }),
    ).not.toBeInTheDocument();
  });
});
