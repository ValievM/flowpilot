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
describe('board dialog session regressions', () => {
  it('keeps successful delete feedback authoritative after a duplicate submit', async () => {
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
    fireEvent.change(screen.getByLabelText('Переместить карточки в'), {
      target: { value: 'todo' },
    });
    const deleteButton = within(deleteDialog).getByRole('button', {
      name: 'Удалить колонку',
    });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);
    expect(api.applyMock).toHaveBeenCalledTimes(1);

    await resolveDeferred(pending, {
      ok: true,
      value: snapshot([task('other', 'todo')]),
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Изменения сохранены.')).toBeInTheDocument();
    expect(
      screen.queryByText(/Доска изменилась в другом месте/),
    ).not.toBeInTheDocument();
  });

  it('reconciles a reopened column editor after a cancelled rename succeeds late', async () => {
    const custom = {
      id: 'custom',
      name: 'Исходная',
      description: 'Старое описание',
      state: 'todo' as const,
      builtIn: false,
    };
    const initial = {
      ...snapshot(),
      columns: [...columns, custom],
    };
    const updated = {
      ...initial,
      columns: [
        ...columns,
        { ...custom, name: 'Новое имя', description: 'Новое описание' },
      ],
      revision: initial.revision + 1,
    };
    const api = createBoardApi(initial);
    const pending = deferApplies(api);
    renderBoard(api);
    const boardColumn = await screen.findByRole('region', { name: 'Исходная' });
    fireEvent.click(
      within(boardColumn).getByRole('button', {
        name: 'Переименовать колонку Исходная',
      }),
    );
    const oldDialog = screen.getByRole('dialog', { name: 'Изменить колонку' });
    fireEvent.change(within(oldDialog).getByLabelText('Название'), {
      target: { value: 'Отменённое имя' },
    });
    fireEvent.click(
      within(oldDialog).getByRole('button', { name: 'Сохранить' }),
    );
    fireEvent.click(within(oldDialog).getByRole('button', { name: 'Отмена' }));

    fireEvent.click(
      within(await screen.findByRole('region', { name: 'Исходная' })).getByRole(
        'button',
        { name: 'Переименовать колонку Исходная' },
      ),
    );
    const currentDialog = screen.getByRole('dialog', {
      name: 'Изменить колонку',
    });
    await resolveDeferred(pending, { ok: true, value: updated });

    expect(within(currentDialog).getByLabelText('Название')).toHaveValue(
      'Новое имя',
    );
    expect(within(currentDialog).getByLabelText('Описание')).toHaveValue(
      'Новое описание',
    );
    fireEvent.change(within(currentDialog).getByLabelText('Название'), {
      target: { value: 'Пользовательское имя' },
    });
    fireEvent.click(
      within(currentDialog).getByRole('button', { name: 'Сохранить' }),
    );
    expect(api.applyMock).toHaveBeenLastCalledWith({
      commands: [
        {
          kind: 'column.rename',
          id: 'custom',
          name: 'Пользовательское имя',
          description: 'Новое описание',
        },
      ],
      expectedRevision: updated.revision,
    });
    await resolveDeferred(pending, {
      ok: true,
      value: {
        ...updated,
        columns: [
          ...columns,
          {
            ...custom,
            name: 'Пользовательское имя',
            description: 'Новое описание',
          },
        ],
        revision: updated.revision + 1,
      },
    });

    const currentColumn = await screen.findByRole('region', {
      name: 'Пользовательское имя',
    });
    fireEvent.click(
      within(currentColumn).getByRole('button', {
        name: 'Переименовать колонку Пользовательское имя',
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Изменить колонку' }),
      ).getByRole('button', { name: 'Сохранить' }),
    );
    expect(api.applyMock).toHaveBeenLastCalledWith({
      commands: [
        {
          kind: 'column.rename',
          id: 'custom',
          name: 'Пользовательское имя',
          description: 'Новое описание',
        },
      ],
      expectedRevision: updated.revision + 1,
    });
  });

  it('shows an accessible error when a column name contains only whitespace', async () => {
    const api = createBoardApi();
    renderBoard(api);
    await screen.findByText('Написать отчёт');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
    const dialog = screen.getByRole('dialog', { name: 'Новая колонка' });
    fireEvent.change(within(dialog).getByLabelText('Название'), {
      target: { value: '   ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Введите название колонки.',
    );
    expect(api.applyMock).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });
  it('closes a reopened editor when a cancelled delete succeeds late', async () => {
    const custom = {
      id: 'custom',
      name: 'Своя',
      description: '',
      state: 'todo' as const,
      builtIn: false,
    };
    const initial = {
      ...snapshot([task('other', 'custom')]),
      columns: [...columns, custom],
    };
    const deleted = {
      ...initial,
      columns,
      tasks: [task('other', 'todo')],
      revision: initial.revision + 1,
    };
    const api = createBoardApi(initial);
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

    fireEvent.click(
      within(await screen.findByRole('region', { name: 'Своя' })).getByRole(
        'button',
        { name: 'Переименовать колонку Своя' },
      ),
    );
    expect(
      screen.getByRole('dialog', { name: 'Изменить колонку' }),
    ).toBeInTheDocument();

    await resolveDeferred(pending, { ok: true, value: deleted });

    expect(
      screen.queryByRole('dialog', { name: 'Изменить колонку' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Своя' }),
    ).not.toBeInTheDocument();
    expect(api.applyMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
    expect(
      screen.getByRole('dialog', { name: 'Новая колонка' }),
    ).toBeInTheDocument();
  });
});

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
