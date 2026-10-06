import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  columns,
  createBoardApi,
  renderBoard,
  snapshot,
  task,
  type MockBoardApi,
} from './board-test-data';
import type { IpcSnapshot } from '../../shared/contracts';
import type { Result } from '../../shared/ipc-result';

type ApplyResponse = Result<IpcSnapshot>;

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
    fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
    const addDialog = screen.getByRole('dialog', { name: 'Новая колонка' });
    expect(within(addDialog).queryByRole('alert')).not.toBeInTheDocument();
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

  it('keeps a reopened add dialog after a cancelled add succeeds late', async () => {
    const api = createBoardApi();
    let resolveApply: ((result: ApplyResponse) => void) | undefined;
    api.applyMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve;
        }),
    );
    renderBoard(api);
    await screen.findByText('Написать отчёт');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
    const oldDialog = screen.getByRole('dialog', { name: 'Новая колонка' });
    fireEvent.change(within(oldDialog).getByLabelText('Название'), {
      target: { value: 'Старая' },
    });
    fireEvent.click(
      within(oldDialog).getByRole('button', { name: 'Сохранить' }),
    );
    fireEvent.click(within(oldDialog).getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
    const currentDialog = screen.getByRole('dialog', { name: 'Новая колонка' });

    const complete = resolveApply;
    if (!complete) throw new Error('Expected deferred apply');
    await act(async () => {
      complete({ ok: true, value: snapshot() });
      await Promise.resolve();
    });

    expect(currentDialog).toBeInTheDocument();
    expect(within(currentDialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the new add error after a cancelled waiting move succeeds late', async () => {
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    await screen.findByText('Написать отчёт');
    await chooseWaiting();
    const waitingDialog = screen.getByRole('dialog', {
      name: 'Почему задача ожидает?',
    });
    fireEvent.change(within(waitingDialog).getByLabelText(/Причина/), {
      target: { value: 'Жду ответ' },
    });
    fireEvent.click(
      within(waitingDialog).getByRole('button', { name: 'Переместить' }),
    );
    fireEvent.click(
      within(waitingDialog).getByRole('button', { name: 'Отмена' }),
    );
    const addDialog = submitAdd();
    expect(api.applyMock).toHaveBeenCalledTimes(2);

    await resolveDeferred(pending, { ok: true, value: snapshot() });
    await resolveDeferred(pending, { ok: false, error: 'StaleRevision' });

    expect(await within(addDialog).findByRole('alert')).toHaveTextContent(
      'Доска изменилась в другом месте. Показаны актуальные данные; это изменение не применено.',
    );
  });

  it('keeps the new add error after a cancelled delete succeeds late', async () => {
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
    const pending = deferApplies(api);
    renderBoard(api);
    const boardColumn = await screen.findByRole('region', { name: 'Своя' });
    fireEvent.click(
      within(boardColumn).getByRole('button', { name: 'Удалить колонку' }),
    );
    const deleteDialog = screen.getByRole('dialog', {
      name: 'Удалить колонку?',
    });
    fireEvent.change(
      within(deleteDialog).getByLabelText('Переместить карточки в'),
      { target: { value: 'todo' } },
    );
    fireEvent.click(
      within(deleteDialog).getByRole('button', { name: 'Удалить колонку' }),
    );
    fireEvent.click(
      within(deleteDialog).getByRole('button', { name: 'Отмена' }),
    );
    const addDialog = submitAdd();
    expect(api.applyMock).toHaveBeenCalledTimes(2);

    await resolveDeferred(pending, { ok: true, value: snapshot() });
    await resolveDeferred(pending, { ok: false, error: 'StaleRevision' });

    expect(await within(addDialog).findByRole('alert')).toHaveTextContent(
      'Доска изменилась в другом месте. Показаны актуальные данные; это изменение не применено.',
    );
  });
});

async function chooseWaiting(): Promise<void> {
  const trigger = screen.getByRole('button', { name: 'Переместить в…' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(trigger, { button: 0 });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Ожидание' }));
}

function deferApplies(
  api: MockBoardApi,
): Array<(result: ApplyResponse) => void> {
  const pending: Array<(result: ApplyResponse) => void> = [];
  api.applyMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
  );
  return pending;
}

async function resolveDeferred(
  pending: Array<(result: ApplyResponse) => void>,
  result: ApplyResponse,
): Promise<void> {
  const resolve = pending.shift();
  if (!resolve) throw new Error('Expected deferred apply');
  await act(async () => {
    resolve(result);
    await Promise.resolve();
  });
}

function submitAdd(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
  const dialog = screen.getByRole('dialog', { name: 'Новая колонка' });
  fireEvent.change(within(dialog).getByLabelText('Название'), {
    target: { value: 'Новая колонка' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
  return dialog;
}
