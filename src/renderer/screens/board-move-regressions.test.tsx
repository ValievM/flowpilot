import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('board move submission regressions', () => {
  it('keeps a menu move successful when its destination is selected twice', async () => {
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    await screen.findByText('Написать отчёт');

    await selectDoingFromMenu();
    await selectDoingFromMenu();

    expect(api.applyMock).toHaveBeenCalledTimes(1);
    await resolveApply(pending, { ok: true, value: movedTaskSnapshot() });
    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(
      screen.queryByText(/это изменение не применено/),
    ).not.toBeInTheDocument();
  });

  it('keeps a pointer drop successful when the same task is dropped twice', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const label = this.getAttribute('aria-label');
        if (label === 'Делаю') return new DOMRect(200, 0, 160, 180);
        if (label === 'Сделать') return new DOMRect(0, 0, 160, 180);
        return new DOMRect(0, 0, 0, 0);
      },
    );
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    const card = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });

    dropOnDoing(card);
    dropOnDoing(card);

    expect(api.applyMock).toHaveBeenCalledTimes(1);
    await resolveApply(pending, { ok: true, value: movedTaskSnapshot() });
    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(
      screen.queryByText(/это изменение не применено/),
    ).not.toBeInTheDocument();
  });

  it('submits a waiting confirmation only once while apply is pending', async () => {
    const api = createBoardApi();
    const pending = deferApplies(api);
    renderBoard(api);
    await moveToWaitingWithKeyboard();
    const dialog = await screen.findByRole('dialog', {
      name: 'Почему задача ожидает?',
    });
    fireEvent.change(screen.getByLabelText(/Причина/), {
      target: { value: 'Жду ответ' },
    });
    fireEvent.change(screen.getByLabelText('Срок ожидания необязательно'), {
      target: { value: '2026-10-10' },
    });
    const confirm = screen.getByRole('button', { name: 'Переместить' });

    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(api.applyMock).toHaveBeenCalledTimes(1);
    expect(api.applyMock).toHaveBeenCalledWith({
      commands: [
        {
          kind: 'task.move',
          id: 'task',
          columnId: 'waiting',
          status: {
            kind: 'waiting',
            reason: 'Жду ответ',
            until: '2026-10-10',
          },
        },
      ],
      expectedRevision: 12,
    });
    await resolveApply(pending, { ok: true, value: waitingTaskSnapshot() });
    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
    expect(
      screen.queryByText(/это изменение не применено/),
    ).not.toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });

  it.each([
    {
      label: 'success',
      result: { ok: true, value: waitingTaskSnapshot() },
      notice: 'Изменения сохранены.',
    },
    {
      label: 'stale revision',
      result: { ok: false, error: 'StaleRevision' },
      notice:
        'Доска изменилась в другом месте. Показаны актуальные данные; это изменение не применено.',
    },
  ] as const)(
    'keeps a new dialog and status after cancelled waiting move returns $label',
    async ({ result, notice }) => {
      const api = createBoardApi();
      const pending = deferApplies(api);
      renderBoard(api);
      await moveToWaitingWithKeyboard();
      const waitingDialog = await screen.findByRole('dialog', {
        name: 'Почему задача ожидает?',
      });
      fireEvent.change(screen.getByLabelText(/Причина/), {
        target: { value: 'Жду ответ' },
      });
      fireEvent.click(
        within(waitingDialog).getByRole('button', { name: 'Переместить' }),
      );
      fireEvent.click(
        within(waitingDialog).getByRole('button', { name: 'Отмена' }),
      );
      const addDialog = openAddDialog();

      await resolveApply(pending, result);

      expect(addDialog).toBeInTheDocument();
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('shows stale revision for a move in the still-current session', async () => {
    const api = createBoardApi();
    api.applyMock.mockResolvedValueOnce({ ok: false, error: 'StaleRevision' });
    renderBoard(api);
    await selectDoingFromMenu();

    expect(
      await screen.findByText(
        'Доска изменилась в другом месте. Показаны актуальные данные; это изменение не применено.',
      ),
    ).toBeInTheDocument();
  });
});

async function selectDoingFromMenu(): Promise<void> {
  const trigger = await screen.findByRole('button', {
    name: 'Переместить в…',
  });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(trigger, { button: 0 });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Делаю' }));
}

async function moveToWaitingWithKeyboard(): Promise<void> {
  const card = await screen.findByRole('article', {
    name: 'Задача: Написать отчёт',
  });
  card.focus();
  fireEvent.keyDown(card, { key: ' ', code: 'Space' });
  await waitFor(() => expect(card).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.keyDown(card, { key: 'ArrowRight', code: 'ArrowRight' });
  fireEvent.keyDown(card, { key: 'ArrowRight', code: 'ArrowRight' });
  fireEvent.keyDown(card, { key: ' ', code: 'Space' });
}

function deferApplies(api: MockBoardApi): ResolveApply[] {
  const pending: ResolveApply[] = [];
  api.applyMock.mockImplementation(() => {
    let resolve: ResolveApply | undefined;
    const promise = new Promise<ApplyResponse>((resolvePromise) => {
      resolve = resolvePromise;
    });
    if (!resolve) throw new Error('Expected deferred apply');
    pending.push(resolve);
    return promise;
  });
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

function movedTaskSnapshot(): IpcSnapshot {
  const movedTask = {
    ...task('task', 'doing'),
    status: { kind: 'doing' as const },
  };
  return { ...snapshot([movedTask]), revision: 13 };
}

function waitingTaskSnapshot(): IpcSnapshot {
  const waitingTask = {
    ...task('task', 'waiting'),
    status: {
      kind: 'waiting' as const,
      reason: 'Жду ответ',
      until: '2026-10-10',
    },
  };
  return { ...snapshot([waitingTask]), revision: 13 };
}

function openAddDialog(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Добавить колонку' }));
  return screen.getByRole('dialog', { name: 'Новая колонка' });
}

function dropOnDoing(card: HTMLElement): void {
  fireEvent(card, pointerEvent('pointerdown', 10, 10));
  fireEvent(document, pointerEvent('pointermove', 240, 40));
  fireEvent(document, pointerEvent('pointermove', 240, 40));
  fireEvent(document, pointerEvent('pointerup', 240, 40));
}

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
