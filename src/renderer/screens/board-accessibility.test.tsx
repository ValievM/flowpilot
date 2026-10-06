import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  columns,
  createBoardApi,
  renderBoard,
  snapshot,
} from './board-test-data';

afterEach(() => {
  cleanup();
});

describe('board accessibility', () => {
  it('opens board dialogs modally and returns focus when Escape closes them', async () => {
    const value = renderBoard();
    const trigger = await screen.findByRole('button', {
      name: 'Добавить колонку',
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Новая колонка' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Новая колонка' }),
      ).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
    expect(value.applyMock).not.toHaveBeenCalled();
  });

  it('announces the visible name of a custom drag destination', async () => {
    const customColumn = {
      id: 'custom-column',
      name: 'Согласование',
      description: '',
      state: 'doing' as const,
      builtIn: false,
    };
    const value = renderBoard(
      createBoardApi({
        ...snapshot(),
        columns: [...columns, customColumn],
      }),
    );
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    taskCard.focus();
    expect(document.activeElement).toBe(taskCard);
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).toHaveAttribute('aria-pressed', 'true');
    });
    for (let index = 0; index < 4; index += 1) {
      fireEvent.keyDown(taskCard, { key: 'ArrowRight', code: 'ArrowRight' });
    }
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(
        document.querySelector('[aria-live="assertive"]'),
      ).toHaveTextContent('Согласование');
      expect(value.applyMock).toHaveBeenCalledWith({
        commands: [
          {
            kind: 'task.move',
            id: 'task',
            columnId: 'custom-column',
            status: { kind: 'doing' },
          },
        ],
        expectedRevision: 12,
      });
    });
  });

  it('provides Russian instructions for keyboard task movement', async () => {
    renderBoard();
    await screen.findByRole('article', { name: 'Задача: Написать отчёт' });
    expect(
      screen.getByText(
        'Чтобы переместить карточку, нажмите пробел, используйте стрелки для выбора колонки, затем нажмите пробел. Нажмите Escape, чтобы отменить перемещение.',
      ),
    ).toBeInTheDocument();
  });
});
