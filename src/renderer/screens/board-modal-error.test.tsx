import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  columns,
  createBoardApi,
  renderBoard,
  snapshot,
  task,
} from './board-test-data';

afterEach(cleanup);

describe('apply feedback in board dialogs', () => {
  it('keeps an apply error accessible in the waiting dialog and clears it on retry', async () => {
    const api = createBoardApi();
    api.applyMock.mockResolvedValueOnce({ ok: false, error: 'InternalError' });
    renderBoard(api);
    await screen.findByText('Написать отчёт');
    await chooseWaiting();
    fireEvent.change(screen.getByLabelText(/Причина/), {
      target: { value: 'Жду ответ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Переместить' }));

    const dialog = screen.getByRole('dialog', {
      name: 'Почему задача ожидает?',
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить изменения. Проверьте данные и повторите попытку.',
    );

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Переместить' }),
    );
    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows stale-revision feedback in the delete dialog and clears it after dismissal', async () => {
    const custom = {
      id: 'custom',
      name: 'Своя',
      description: '',
      state: 'todo' as const,
      builtIn: false,
    };
    const api = createBoardApi({
      ...snapshot([task('other', 'custom')]),
      columns: [...columns, custom],
    });
    api.applyMock.mockResolvedValue({ ok: false, error: 'StaleRevision' });
    renderBoard(api);
    const boardColumn = await screen.findByRole('region', { name: 'Своя' });
    fireEvent.click(
      within(boardColumn).getByRole('button', { name: 'Удалить колонку' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Удалить колонку?' });
    fireEvent.change(screen.getByLabelText('Переместить карточки в'), {
      target: { value: 'todo' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Удалить колонку' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Доска изменилась в другом месте. Показаны актуальные данные; это изменение не применено.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Своя' })).getByRole('button', {
        name: 'Переименовать колонку Своя',
      }),
    );
    const editDialog = screen.getByRole('dialog', {
      name: 'Изменить колонку',
    });
    expect(within(editDialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});

async function chooseWaiting(): Promise<void> {
  const trigger = screen.getByRole('button', { name: 'Переместить в…' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(trigger, { button: 0 });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Ожидание' }));
}
