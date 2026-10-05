import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  columns,
  createBoardApi,
  renderBoard,
  snapshot,
  task,
} from './board-test-data';

afterEach(() => {
  cleanup();
});

describe('board task movement', () => {
  it('shows the four persisted default columns', async () => {
    renderBoard();
    for (const name of ['Сделать', 'Делаю', 'Ожидание', 'Готово'])
      await screen.findByRole('region', { name });
  });

  it('moves a selected task through the move menu using the current revision', async () => {
    const value = renderBoard();
    await screen.findByText('Написать отчёт');
    fireEvent.change(screen.getByRole('combobox', { name: /Переместить в/ }), {
      target: { value: 'doing' },
    });
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith({
        commands: [
          {
            kind: 'task.move',
            id: 'task',
            columnId: 'doing',
            status: { kind: 'doing' },
          },
        ],
        expectedRevision: 12,
      });
    });
  });

  it('allows keyboard selection in the move menu', async () => {
    const value = renderBoard();
    await screen.findByText('Написать отчёт');
    const menu = screen.getByRole('combobox', { name: /Переместить в/ });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.change(menu, { target: { value: 'done' } });
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            expect.objectContaining({ kind: 'task.move', columnId: 'done' }),
          ],
        }),
      );
    });
  });
  it('supports keyboard pickup and cancellation with the drag sensor', async () => {
    const value = renderBoard();
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).toHaveAttribute('aria-pressed', 'true');
    });
    fireEvent.keyDown(taskCard, { key: 'Escape', code: 'Escape' });
    await waitFor(() => {
      expect(taskCard).not.toHaveAttribute('aria-pressed', 'true');
    });
    expect(value.applyMock).not.toHaveBeenCalled();
  });

  it('requires a non-empty reason before moving into waiting', async () => {
    const value = renderBoard();
    await screen.findByText('Написать отчёт');
    fireEvent.change(screen.getByRole('combobox', { name: /Переместить в/ }), {
      target: { value: 'waiting' },
    });
    const move = await screen.findByRole('button', { name: 'Переместить' });
    expect(move).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Причина/), {
      target: { value: 'Жду ответ' },
    });
    expect(move).toBeEnabled();
    fireEvent.click(move);
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            {
              kind: 'task.move',
              id: 'task',
              columnId: 'waiting',
              status: { kind: 'waiting', reason: 'Жду ответ' },
            },
          ],
        }),
      );
    });
  });

  it('requires a destination before deleting a non-empty column', async () => {
    const custom = {
      id: 'custom',
      name: 'Своя',
      description: '',
      state: 'todo' as const,
      builtIn: false,
    };
    const value = renderBoard(
      createBoardApi({
        ...snapshot([task('other', 'custom')]),
        columns: [...columns, custom],
      }),
    );
    const section = await screen.findByRole('region', { name: 'Своя' });
    fireEvent.click(
      within(section).getByRole('button', { name: 'Удалить колонку' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Удалить колонку?' });
    const remove = within(dialog).getByRole('button', {
      name: 'Удалить колонку',
    });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Переместить карточки в'), {
      target: { value: 'todo' },
    });
    fireEvent.click(remove);
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            { kind: 'column.delete', id: 'custom', targetColumnId: 'todo' },
          ],
        }),
      );
    });
  });

  it('deletes an empty custom column without asking for a destination', async () => {
    const custom = {
      id: 'custom',
      name: 'Своя',
      description: '',
      state: 'todo' as const,
      builtIn: false,
    };
    const value = renderBoard(
      createBoardApi({ ...snapshot([]), columns: [...columns, custom] }),
    );
    const section = await screen.findByRole('region', { name: 'Своя' });
    fireEvent.click(
      within(section).getByRole('button', { name: 'Удалить колонку' }),
    );
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [{ kind: 'column.delete', id: 'custom' }],
        }),
      );
    });
  });

  it('shows the persisted waiting reason on the task card', async () => {
    const waitingTask = {
      ...task('waiting-task', 'waiting'),
      status: { kind: 'waiting' as const, reason: 'Жду ответ' },
    };
    renderBoard(createBoardApi({ ...snapshot([waitingTask]) }));
    expect(
      await screen.findByText('Причина ожидания: Жду ответ'),
    ).toBeInTheDocument();
  });

  it('reloads and announces a stale revision instead of retaining an optimistic move', async () => {
    const value = createBoardApi();
    value.applyMock.mockResolvedValue({ ok: false, error: 'StaleRevision' });
    renderBoard(value);
    await screen.findByText('Написать отчёт');
    fireEvent.change(screen.getByRole('combobox', { name: /Переместить в/ }), {
      target: { value: 'doing' },
    });
    expect(
      await screen.findByText(/Показаны актуальные данные/),
    ).toBeInTheDocument();
    expect(value.loadMock).toHaveBeenCalledTimes(2);
    expect(
      within(screen.getByRole('region', { name: 'Сделать' })).getByText(
        'Написать отчёт',
      ),
    ).toBeInTheDocument();
  });

  it('reports when stale data could not be refreshed', async () => {
    const value = createBoardApi();
    value.loadMock
      .mockResolvedValueOnce({ ok: true, value: snapshot() })
      .mockResolvedValueOnce({ ok: false, error: 'InternalError' });
    value.applyMock.mockResolvedValue({ ok: false, error: 'StaleRevision' });
    renderBoard(value);
    await screen.findByText('Написать отчёт');
    fireEvent.change(screen.getByRole('combobox', { name: /Переместить в/ }), {
      target: { value: 'doing' },
    });
    expect(
      await screen.findByText(/Актуальные данные загрузить не удалось/),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить доску',
    );
  });
});
