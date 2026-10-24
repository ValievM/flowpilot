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
});

describe('board task movement', () => {
  it('shows the four persisted default columns', async () => {
    renderBoard();
    for (const name of ['Сделать', 'Делаю', 'Ожидание', 'Готово'])
      await screen.findByRole('region', { name });
  });

  it('moves a selected task through the move menu using the current revision', async () => {
    const value = renderBoard();
    await screen.findByText('Написать отчёт');
    await selectMove('Делаю');
    await waitFor(() => {
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

  it('allows keyboard selection in the move menu', async () => {
    const value = renderBoard();
    await screen.findByText('Написать отчёт');
    const menu = screen.getByRole('button', { name: 'Переместить в…' });
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    const target = await screen.findByRole('menuitem', { name: 'Готово' });
    fireEvent.keyDown(target, { key: 'Enter' });
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            expect.objectContaining({ kind: 'task.move', columnId: 'done' }),
          ],
        }),
      );
    });
  });

  it('supports keyboard pickup and cancellation with the drag sensor', async () => {
    const value = renderBoard();
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).toHaveAttribute('aria-pressed', 'true');
    });
    fireEvent.keyDown(taskCard, { key: 'Escape', code: 'Escape' });
    await waitFor(() => {
      expect(taskCard).not.toHaveAttribute('aria-pressed', 'true');
    });
    expect(value.applyMock).not.toHaveBeenCalled();
  });

  it('moves a task to the next column with the keyboard drag sensor', async () => {
    const value = renderBoard();
    const taskCard = await screen.findByRole('article', {
      name: 'Задача: Написать отчёт',
    });
    taskCard.focus();
    expect(document.activeElement).toBe(taskCard);
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('Написать отчёт');
    });
    expect(screen.getByRole('status')).not.toHaveTextContent('task:task');
    fireEvent.keyDown(taskCard, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.keyDown(taskCard, { key: ' ', code: 'Space' });
    await waitFor(() => {
      expect(taskCard).not.toHaveAttribute('aria-pressed', 'true');
    });
    await waitFor(() => {
      expect(
        document.querySelector('[aria-live="assertive"]'),
      ).toHaveTextContent('Делаю');
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
    expect(await screen.findByText('Изменения сохранены.')).toBeInTheDocument();
  });

  it('requires a non-empty reason before moving into waiting', async () => {
    const value = renderBoard();
    await screen.findByText('Написать отчёт');
    await selectMove('Ожидание');
    const move = await screen.findByRole('button', { name: 'Переместить' });
    expect(move).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Причина/), {
      target: { value: 'Жду ответ' },
    });
    expect(move).toBeEnabled();
    fireEvent.click(move);
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            {
              kind: 'task.move',
              id: 'task',
              columnId: 'waiting',
              status: { kind: 'waiting', reason: 'Жду ответ' },
            },
          ],
        }),
      );
    });
  });

  it('requires a destination before deleting a non-empty column', async () => {
    const custom = {
      id: 'custom',
      name: 'Своя',
      description: '',
      state: 'todo' as const,
      builtIn: false,
    };
    const value = renderBoard(
      createBoardApi({
        ...snapshot([task('other', 'custom')]),
        columns: [...columns, custom],
      }),
    );
    const section = await screen.findByRole('region', { name: 'Своя' });
    fireEvent.click(
      within(section).getByRole('button', { name: 'Удалить колонку' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Удалить колонку?' });
    const remove = within(dialog).getByRole('button', {
      name: 'Удалить колонку',
    });
    expect(remove).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Переместить карточки в'), {
      target: { value: 'todo' },
    });
    fireEvent.click(remove);
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [
            { kind: 'column.delete', id: 'custom', targetColumnId: 'todo' },
          ],
        }),
      );
    });
  });

  it('deletes an empty custom column without asking for a destination', async () => {
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
    await waitFor(() => {
      expect(value.applyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [{ kind: 'column.delete', id: 'custom' }],
        }),
      );
    });
  });

  it('shows the persisted waiting reason on the task card', async () => {
    const waitingTask = {
      ...task('waiting-task', 'waiting'),
      status: { kind: 'waiting' as const, reason: 'Жду ответ' },
    };
    renderBoard(createBoardApi({ ...snapshot([waitingTask]) }));
    expect(
      await screen.findByText('Причина ожидания: Жду ответ'),
    ).toBeInTheDocument();
  });

  it('reloads and announces a stale revision instead of retaining an optimistic move', async () => {
    const value = createBoardApi();
    value.applyMock.mockResolvedValue({ ok: false, error: 'StaleRevision' });
    renderBoard(value);
    await screen.findByText('Написать отчёт');
    await selectMove('Делаю');
    expect(
      await screen.findByText(/Показаны актуальные данные/),
    ).toBeInTheDocument();
    expect(value.loadMock).toHaveBeenCalledTimes(2);
    expect(
      within(screen.getByRole('region', { name: 'Сделать' })).getByText(
        'Написать отчёт',
      ),
    ).toBeInTheDocument();
  });

  it('reports when stale data could not be refreshed', async () => {
    const value = createBoardApi();
    value.loadMock
      .mockResolvedValueOnce({ ok: true, value: snapshot() })
      .mockResolvedValueOnce({ ok: false, error: 'InternalError' });
    value.applyMock.mockResolvedValue({ ok: false, error: 'StaleRevision' });
    renderBoard(value);
    await screen.findByText('Написать отчёт');
    await selectMove('Делаю');
    expect(
      await screen.findByText(/Актуальные данные загрузить не удалось/),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить доску',
    );
  });

  it('shows unknown deadline volume without a risk claim', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    const card = { ...task(), deadline: '2026-10-09' };
    renderBoard(createBoardApi(snapshot([card])));
    const unknownRisk = await screen.findByText(
      'Срок есть, объём неизвестен. По приблизительной оценке.',
    );
    expect(unknownRisk).toHaveAttribute('data-risk-kind', 'unknown');
    expect(unknownRisk).not.toHaveClass('is-risk');
  });

  it('writes the deadline like the other screens and keeps title, deadline, risk in that order', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
    renderBoard(
      createBoardApi(snapshot([{ ...task(), deadline: '2026-10-09' }])),
    );
    const deadline = await screen.findByText('Срок: 09.10.2026');
    const risk = screen.getByText(
      'Срок есть, объём неизвестен. По приблизительной оценке.',
    );
    const title = screen.getByRole('button', {
      name: new RegExp(`Открыть задачу: ${task().title}`),
    });
    const before = (a: Node, b: Node): boolean =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(title, deadline)).toBe(true);
    expect(before(deadline, risk)).toBe(true);
  });

  it('renders a retryable error if the real snapshot cannot load', async () => {
    const value = createBoardApi();
    value.loadMock.mockResolvedValue({
      ok: false,
      error: 'InternalError',
    });
    renderBoard(value);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить доску',
    );
    expect(
      screen.getByRole('button', { name: 'Повторить' }),
    ).toBeInTheDocument();
  });
});

async function selectMove(columnName: string): Promise<void> {
  const trigger = screen.getByRole('button', { name: 'Переместить в…' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(trigger, { button: 0 });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('menuitem', { name: columnName }));
}
