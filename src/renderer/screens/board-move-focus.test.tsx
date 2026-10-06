import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderBoard } from './board-test-data';

afterEach(cleanup);

describe('board move menu keyboard focus', () => {
  it('opens the move menu with Space without starting a keyboard drag', async () => {
    const value = renderBoard();
    const card = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    const trigger = within(card).getByRole('button', {
      name: 'Переместить в…',
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: ' ', code: 'Space' });
    fireEvent.keyUp(trigger, { key: ' ', code: 'Space' });
    expect(await screen.findByRole('menu')).toBeVisible();
    expect(card).not.toHaveAttribute('aria-pressed', 'true');
    expect(value.applyMock).not.toHaveBeenCalled();
  });

  it('restores focus to a moved task card after its move is saved', async () => {
    renderBoard();
    const card = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    const trigger = within(card).getByRole('button', {
      name: 'Переместить в…',
    });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(trigger, { button: 0 });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Делаю' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Делаю' })).getByRole(
          'article',
          { name: 'Задача: Написать отчёт' },
        ),
      ).toHaveFocus();
    });
  });
});
