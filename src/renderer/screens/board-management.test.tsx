import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

describe('board columns and empty states', () => {
  it('wraps long task titles without clipping them', async () => {
    const title = 'Задача '.repeat(50);
    renderBoard(createBoardApi(snapshot([task('long', 'todo', title)])));
    expect(await screen.findByRole('article')).toHaveTextContent(title);
  });

  it('gives task cards and move controls accessible names', async () => {
    renderBoard();
    expect(
      await screen.findByRole('article', { name: 'Задача: Написать отчёт' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Добавить колонку' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /Переместить в/ }),
    ).toBeInTheDocument();
  });

  it('shows empty hints for columns without tasks', async () => {
    renderBoard(createBoardApi(snapshot([])));
    expect(
      await screen.findAllByText('В этой колонке пока нет задач.'),
    ).toHaveLength(4);
  });

  it('shows unknown deadline volume without a risk claim', async () => {
    const card = { ...task(), deadline: '2026-10-09' };
    renderBoard(createBoardApi(snapshot([card])));
    expect(
      await screen.findByText('Срок есть, объём неизвестен'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Оценка остатка работы не указана.'),
    ).toBeInTheDocument();
  });

  it('creates a persistent custom column with its semantic state', async () => {
    const value = renderBoard();
    await screen.findByRole('region', { name: 'Сделать' });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'На проверке' },
    });
    fireEvent.change(screen.getByLabelText('Описание'), {
      target: { value: 'Жду проверки' },
    });
    fireEvent.change(screen.getByLabelText('Смысл состояния'), {
      target: { value: 'waiting' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalled();
    });
    const command = value.applyMock.mock.calls[0]?.[0].commands[0];
    expect(command).toMatchObject({
      kind: 'column.create',
      column: {
        name: 'На проверке',
        description: 'Жду проверки',
        state: 'waiting',
        builtIn: false,
      },
    });
  });

  it('renames a custom column through the persistent command', async () => {
    const custom = {
      id: 'custom',
      name: 'Своя',
      description: 'Описание',
      state: 'todo' as const,
      builtIn: false,
    };
    const value = renderBoard(
      createBoardApi({ ...snapshot([]), columns: [...columns, custom] }),
    );
    await screen.findByRole('region', { name: 'Своя' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Переименовать колонку Своя' }),
    );
    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: 'В планах' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            {
              kind: 'column.rename',
              id: 'custom',
              name: 'В планах',
              description: 'Описание',
            },
          ],
        }),
      );
    });
  });

  it('moves a dragged card persistently when dropped in a column', async () => {
    const value = renderBoard();
    fireEvent.dragStart(
      await screen.findByRole('article', { name: 'Задача: Написать отчёт' }),
      { dataTransfer: { setData: () => {} } },
    );
    fireEvent.drop(screen.getByRole('region', { name: 'Делаю' }));
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            expect.objectContaining({
              kind: 'task.move',
              id: 'task',
              columnId: 'doing',
            }),
          ],
        }),
      );
    });
  });

  it('renders a retryable error if the real snapshot cannot load', async () => {
    const value = createBoardApi();
    value.loadMock.mockResolvedValue({ ok: false, error: 'InternalError' });
    renderBoard(value);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить доску',
    );
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument();
  });
});
