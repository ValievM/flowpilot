import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcSnapshot } from '../../shared/contracts';
import type { Result } from '../../shared/ipc-result';
import {
  createBoardApi,
  renderBoard,
  snapshot,
  task,
  type MockBoardApi,
} from './board-test-data';

type ApplyResponse = Result<IpcSnapshot>;
type ResolveApply = (result: ApplyResponse) => void;

afterEach(cleanup);

describe('move locks across dialog sessions', () => {
  it('keeps an ordinary move locked after cancel and menu reopen', async () => {
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    await chooseDestination('Делаю');

    openAndCancelAdd();
    await chooseDestination('Делаю');
    expect(api.applyMock).toHaveBeenCalledTimes(1);

    openAddDialog();
    await resolveApply(pending, { ok: true, value: movedSnapshot('doing') });

    const addDialog = screen.getByRole('dialog', { name: 'Новая колонка' });
    expect(addDialog).toBeInTheDocument();
    expect(screen.queryByText('Изменения сохранены.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    const doing = await screen.findByRole('region', { name: 'Делаю' });
    expect(
      within(doing).getByRole('article', { name: 'Задача: Написать отчёт' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/это изменение не применено/)).toBeNull();
  });

  it('releases the ordinary move lock after a failed request', async () => {
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    await chooseDestination('Делаю');
    openAddDialog();
    expect(api.applyMock).toHaveBeenCalledTimes(1);

    await resolveApply(pending, { ok: false, error: 'InternalError' });
    expect(
      screen.getByRole('dialog', { name: 'Новая колонка' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Изменения сохранены.')).toBeNull();
    expect(screen.queryByText(/это изменение не применено/)).toBeNull();

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Новая колонка' })).getByRole(
        'button',
        { name: 'Отмена' },
      ),
    );
    await chooseDestination('Делаю');
    expect(api.applyMock).toHaveBeenCalledTimes(2);
    await resolveApply(pending, { ok: true, value: movedSnapshot('doing') });

    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(screen.queryByText(/это изменение не применено/)).toBeNull();
  });

  it('keeps a waiting move locked after cancel and confirmation reopen', async () => {
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    await chooseDestination('Ожидание');
    await confirmWaitingMove();
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Почему задача ожидает?' }),
      ).getByRole('button', { name: 'Отмена' }),
    );

    await chooseDestination('Ожидание');
    await confirmWaitingMove();
    expect(api.applyMock).toHaveBeenCalledTimes(1);

    await resolveApply(pending, { ok: true, value: movedSnapshot('waiting') });

    const waiting = await screen.findByRole('region', { name: 'Ожидание' });
    expect(
      within(waiting).getByRole('article', {
        name: 'Задача: Написать отчёт',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Почему задача ожидает?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/это изменение не применено/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('releases the reopened waiting lock after a failed request', async () => {
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    await chooseDestination('Ожидание');
    await confirmWaitingMove();
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Почему задача ожидает?' }),
      ).getByRole('button', { name: 'Отмена' }),
    );

    await chooseDestination('Ожидание');
    await confirmWaitingMove();
    expect(api.applyMock).toHaveBeenCalledTimes(1);
    await resolveApply(pending, { ok: false, error: 'InternalError' });

    const dialog = screen.getByRole('dialog', {
      name: 'Почему задача ожидает?',
    });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/это изменение не применено/)).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Переместить' }),
    );
    expect(api.applyMock).toHaveBeenCalledTimes(2);
    await resolveApply(pending, { ok: true, value: movedSnapshot('waiting') });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/это изменение не применено/)).toBeNull();
  });
});

async function chooseDestination(name: string): Promise<void> {
  const trigger = await screen.findByRole('button', { name: 'Переместить в…' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(trigger, { button: 0 });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('menuitem', { name }));
}

async function confirmWaitingMove(): Promise<void> {
  const dialog = await screen.findByRole('dialog', {
    name: 'Почему задача ожидает?',
  });
  fireEvent.change(within(dialog).getByLabelText(/Причина/), {
    target: { value: 'Жду ответ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Переместить' }));
}

function openAddDialog(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
}

function openAndCancelAdd(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Новая колонка' })).getByRole(
      'button',
      { name: 'Отмена' },
    ),
  );
}

function deferApplies(api: MockBoardApi): ResolveApply[] {
  const pending: ResolveApply[] = [];
  api.applyMock.mockImplementation(
    () =>
      new Promise<ApplyResponse>((resolve) => {
        pending.push(resolve);
      }),
  );
  return pending;
}

async function resolveApply(
  pending: ResolveApply[],
  result: ApplyResponse,
): Promise<void> {
  const resolve = pending.shift();
  if (!resolve) throw new Error('Expected deferred apply');
  await act(async () => {
    resolve(result);
    await Promise.resolve();
  });
}

function movedSnapshot(columnId: string): IpcSnapshot {
  const movedTask = {
    ...task('task', columnId),
    status:
      columnId === 'waiting'
        ? ({ kind: 'waiting', reason: 'Жду ответ' } as const)
        : ({ kind: 'doing' } as const),
  };
  return { ...snapshot([movedTask]), revision: 13 };
}
