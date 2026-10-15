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
  vi.restoreAllMocks();
});

describe('board interaction regressions', () => {
  it('restores focus to the board after an empty-column deletion', async () => {
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
    const deleteButton = within(section).getByRole('button', {
      name: 'Удалить колонку',
    });
    deleteButton.focus();
    expect(document.activeElement).toBe(deleteButton);

    fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [{ kind: 'column.delete', id: 'custom' }],
        }),
      );
      expect(document.activeElement).toBe(
        document.querySelector('[data-board-dialog-focus-fallback]'),
      );
    });
  });

  it('announces no movement when keyboard drop returns to its source column', async () => {
    const value = renderBoard();
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    taskCard.focus();
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).toHaveAttribute('aria-pressed', 'true');
    });
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).not.toHaveAttribute('aria-pressed', 'true');
    });

    expect(value.applyMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'осталась в исходной колонке',
      );
    });
    expect(screen.getByRole('status')).not.toHaveTextContent('подтверждение');
    expect(screen.getByRole('status')).not.toHaveTextContent('сохранения');
  });

  it('does not request a reason when a waiting task drops in its source column', async () => {
    const waitingTask = {
      ...task('waiting-task', 'waiting'),
      status: { kind: 'waiting' as const, reason: 'Жду ответ' },
    };
    const value = renderBoard(createBoardApi(snapshot([waitingTask])));
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    taskCard.focus();
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).toHaveAttribute('aria-pressed', 'true');
    });
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).not.toHaveAttribute('aria-pressed', 'true');
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'осталась в исходной колонке',
      );
    });
    expect(value.applyMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('подтверждение');
  });

  it('announces no movement for a pointer drop in the source column', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute('aria-label') === 'Сделать'
          ? new DOMRect(0, 0, 160, 180)
          : new DOMRect(200, 0, 160, 180);
      },
    );
    const value = renderBoard();
    const card = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    fireEvent(card, pointerEvent('pointerdown', 10, 10));
    fireEvent(card, pointerEvent('pointermove', 40, 40));
    fireEvent(card, pointerEvent('pointermove', 40, 40));
    fireEvent(card, pointerEvent('pointerup', 40, 40));

    expect(value.applyMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'осталась в исходной колонке',
      );
    });
    expect(screen.getByRole('status')).not.toHaveTextContent('сохранения');
  });
  it.each([
    ['the gap between columns', 199],
    ['outside every column', 400],
  ])('does not move a task when pointer release is %s', async (_place, x) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const label = this.getAttribute('aria-label');
        if (label === 'Сделать') return new DOMRect(0, 0, 160, 180);
        if (label === 'Делаю') return new DOMRect(200, 0, 160, 180);
        return new DOMRect(0, 0, 0, 0);
      },
    );
    const value = renderBoard();
    const card = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    fireEvent(card, pointerEvent('pointerdown', 10, 10));
    fireEvent(card, pointerEvent('pointermove', x, 40));
    fireEvent(card, pointerEvent('pointermove', x, 40));
    fireEvent(card, pointerEvent('pointerup', x, 40));

    expect(value.applyMock).not.toHaveBeenCalled();
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
