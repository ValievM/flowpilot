import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  columns,
  createBoardApi,
  renderBoard,
  snapshot,
  task,
} from './board-test-data';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('board columns and empty states', () => {
  it('wraps long task titles without clipping them', async () => {
    const title = 'Задача '.repeat(50);
    renderBoard(createBoardApi(snapshot([task('long', 'todo', title)])));
    expect(await screen.findByRole('article')).toHaveTextContent(title);
  });

  it('moves a task from the Radix menu to the selected column', async () => {
    const api = createBoardApi();
    renderBoard(api);
    const menu = await screen.findByRole('button', { name: 'Переместить в…' });
    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(menu, { button: 0 });
    fireEvent.click(menu);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Делаю' }));
    await waitFor(() => {
      expect(api.applyMock).toHaveBeenCalledWith(
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

  it('gives task cards and move controls accessible names', async () => {
    renderBoard();
    expect(
      await screen.findByRole('article', { name: 'Задача: Написать отчёт' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Добавить колонку' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Переместить в…' }),
    ).toHaveLength(1);
  });

  it('shows empty hints for columns without tasks', async () => {
    renderBoard(createBoardApi(snapshot([])));
    expect(
      await screen.findAllByText('В этой колонке пока нет задач.'),
    ).toHaveLength(4);
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

  it('activates and cancels a drag with the pointer sensor', async () => {
    const value = renderBoard();
    const card = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    fireEvent(card, pointerEvent('pointerdown', 10, 10));
    fireEvent(document, pointerEvent('pointermove', 320, 100));
    await waitFor(() => {
      expect(card).toHaveAttribute('data-dragging', 'true');
    });
    fireEvent(document, pointerEvent('pointercancel', 320, 100));
    await waitFor(() => {
      expect(card).not.toHaveAttribute('data-dragging', 'true');
    });
    expect(value.applyMock).not.toHaveBeenCalled();
  });

  it('drops a task over another column and persists exactly one move', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const label = this.getAttribute('aria-label');
        if (label === 'Делаю') return new DOMRect(200, 0, 160, 180);
        if (label === 'Сделать') return new DOMRect(0, 0, 160, 180);
        return new DOMRect(0, 0, 0, 0);
      },
    );
    const value = renderBoard();
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    const doingColumn = screen.getByRole('region', { name: 'Делаю' });
    fireEvent(taskCard, pointerEvent('pointerdown', 10, 10));
    fireEvent(taskCard, pointerEvent('pointermove', 240, 40));
    fireEvent(taskCard, pointerEvent('pointermove', 240, 40));
    await waitFor(() => {
      expect(doingColumn).toHaveAttribute('data-drop-active', 'true');
      expect(doingColumn).toHaveClass('board-column-drop-active');
    });
    fireEvent(taskCard, pointerEvent('pointerup', 240, 40));
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledTimes(1);
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

  it('moves down between columns with the narrow-layout keyboard drag sensor', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 900,
    });
    const value = renderBoard();
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    taskCard.focus();
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() =>
      expect(taskCard).toHaveAttribute('aria-pressed', 'true'),
    );
    fireEvent.keyDown(taskCard, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledTimes(1);
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

  it('announces a waiting-column drop as requiring confirmation, not success', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    const value = renderBoard();
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    taskCard.focus();
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() =>
      expect(taskCard).toHaveAttribute('aria-pressed', 'true'),
    );
    fireEvent.keyDown(taskCard, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.keyDown(taskCard, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    const dialog = await screen.findByRole('dialog', {
      name: 'Почему задача ожидает?',
    });
    expect(screen.getByRole('status')).not.toHaveTextContent('перемещена');
    expect(value.applyMock).not.toHaveBeenCalled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Почему задача ожидает?' }),
      ).toBeNull();
    });
    expect(screen.queryByText('Изменения сохранены.')).toBeNull();
  });

  it('does not open a cancellable dialog when deleting an empty column', async () => {
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
    expect(
      screen.queryByRole('dialog', { name: 'Удалить колонку?' }),
    ).toBeNull();
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledTimes(1);
    });
  });
});

function pointerEvent(
  type: string,
  clientX: number,
  clientY: number,
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'isPrimary', { value: true });
  return event;
}
