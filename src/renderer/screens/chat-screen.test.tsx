import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../domain/task';
import type { AiScenarioResult } from '../../shared/contracts';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import { useChat } from '../chat/use-chat';
import { ChatScreen } from './chat-screen';

afterEach(cleanup);

type Pending = (result: AiScenarioResult) => void;

function ok(value: unknown): AiScenarioResult {
  return { ok: true, value };
}
function failed(kind: string): AiScenarioResult {
  return { ok: false, error: { kind, message: '' } };
}

const proposal = {
  kind: 'confirmation-required',
  proposalId: 'p-1',
  diff: {
    changes: [
      {
        commandIndex: 0,
        entityId: 'new-1',
        field: 'title',
        before: null,
        after: 'Подготовить доклад',
      },
      {
        commandIndex: 0,
        entityId: 'new-1',
        field: 'day',
        before: null,
        after: '2026-10-09',
      },
    ],
    rejectedCommands: [],
  },
  rejectedCommands: [],
};
const applied = { kind: 'applied', revision: 2, rejectedCommands: [] };

function setup(aiMode: 'auto' | 'confirm' = 'confirm') {
  const waiting: Pending[] = [];
  const scenario = vi.fn(
    () =>
      new Promise<AiScenarioResult>((resolve) => {
        waiting.push(resolve);
      }),
  );
  const pending = vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: [] as { operationId: string; prompt: string }[],
    }),
  );
  const reply = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: null }),
  );
  const apply = vi.fn(() => Promise.resolve({ ok: true as const, value: {} }));
  window.flowpilot = {
    ai: { scenario, pending, reply },
    snapshot: {
      load: () =>
        Promise.resolve({
          ok: true as const,
          value: { revision: 4, settings: { aiMode } },
        }),
    },
    commands: { apply },
  } as unknown as FlowPilotApi;
  const onApplied = vi.fn(() => Promise.resolve());
  const undo = vi.fn(() => Promise.resolve('ok' as const));
  function Harness({ tasks }: { tasks: Task[] }) {
    const chat = useChat({ onApplied, undo });
    return <ChatScreen tasks={tasks} chat={chat} />;
  }
  const view = (tasks: Task[] = []) => render(<Harness tasks={tasks} />);
  const answer = (result: AiScenarioResult): void => {
    waiting.shift()?.(result);
  };
  return { scenario, pending, reply, apply, onApplied, undo, view, answer };
}

function send(text: string): void {
  fireEvent.change(screen.getByLabelText('Сообщение помощнику'), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AI chat', () => {
  it('sends a request once while it is running and shows a way to cancel', async () => {
    const chat = setup();
    chat.view();
    send('Подготовить доклад к пятнице');
    expect(await screen.findByRole('status')).toHaveTextContent('Жду ответ AI');
    fireEvent.change(screen.getByLabelText('Сообщение помощнику'), {
      target: { value: 'ещё одно' },
    });
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    expect(chat.scenario).toHaveBeenCalledTimes(1);
    expect(chat.scenario).toHaveBeenCalledWith({
      scenario: 'createFromText',
      text: 'Подготовить доклад к пятнице',
    });
  });

  it('cancels a running request and leaves the data alone', async () => {
    const chat = setup();
    chat.view();
    send('Подготовить доклад');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Отменить запрос' }),
    );
    expect(chat.scenario).toHaveBeenLastCalledWith({ scenario: 'cancel' });
    chat.answer(failed('Aborted'));
    expect(await screen.findByText(/Запрос отменён/)).toBeVisible();
    expect(chat.onApplied).not.toHaveBeenCalled();
  });

  it('shows what will change before anything is applied in confirm mode', async () => {
    const chat = setup('confirm');
    chat.view();
    send('Подготовить доклад');
    chat.answer(ok(proposal));
    expect(await screen.findByText('Предложение AI')).toBeVisible();
    expect(screen.getAllByText('Подготовить доклад').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-10-09')).toBeVisible();
    expect(chat.onApplied).not.toHaveBeenCalled();
  });

  it('applies a confirmed proposal and refreshes the data', async () => {
    const chat = setup('confirm');
    chat.view();
    send('Подготовить доклад');
    chat.answer(ok(proposal));
    fireEvent.click(await screen.findByRole('button', { name: 'Применить' }));
    expect(chat.scenario).toHaveBeenLastCalledWith({
      scenario: 'confirm',
      proposalId: 'p-1',
    });
    chat.answer(ok(applied));
    expect(await screen.findByText('Изменения применены.')).toBeVisible();
    expect(chat.onApplied).toHaveBeenCalledTimes(1);
  });

  it('declines a proposal without applying it', async () => {
    const chat = setup('confirm');
    chat.view();
    send('Подготовить доклад');
    chat.answer(ok(proposal));
    fireEvent.click(await screen.findByRole('button', { name: 'Отклонить' }));
    expect(chat.scenario).toHaveBeenLastCalledWith({
      scenario: 'reject',
      proposalId: 'p-1',
    });
    chat.answer(
      ok({ kind: 'rejected', error: { kind: 'Declined', message: '' } }),
    );
    expect(await screen.findByText(/Предложение отклонено/)).toBeVisible();
    expect(chat.onApplied).not.toHaveBeenCalled();
  });

  it('reports a change applied at once in auto mode and offers undo', async () => {
    const chat = setup('auto');
    chat.view();
    send('Подготовить доклад');
    chat.answer(ok(applied));
    expect(await screen.findByText('Изменения применены.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }));
    expect(await screen.findByText('Изменения отменены.')).toBeVisible();
    expect(chat.undo).toHaveBeenCalledTimes(1);
  });

  it('lists commands the checks dropped instead of hiding them', async () => {
    const chat = setup('confirm');
    chat.view();
    send('Подготовить доклад');
    chat.answer(
      ok({
        ...proposal,
        rejectedCommands: [
          { index: 1, kind: 'task.update', reason: 'invalid-command' },
        ],
      }),
    );
    expect(await screen.findByText('Не применено команд: 1')).toBeVisible();
    expect(screen.getByText(/task.update/)).toBeVisible();
  });

  it.each([
    ['ProviderUnavailable', /AI сейчас недоступен/],
    ['InvalidReply', /Ответ AI не удалось разобрать/],
    ['StaleProposal', /Данные изменились/],
  ])('says in words what went wrong: %s', async (kind, text) => {
    const chat = setup();
    chat.view();
    send('Подготовить доклад');
    chat.answer(failed(kind));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(chat.onApplied).not.toHaveBeenCalled();
  });

  it('treats a reply it cannot read as an invalid reply, not as a success', async () => {
    const chat = setup();
    chat.view();
    send('Подготовить доклад');
    chat.answer(ok({ unexpected: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Ответ AI не удалось разобрать/,
    );
  });

  it('lets the user copy the request out and paste the answer back', async () => {
    const chat = setup();
    chat.pending.mockResolvedValue({
      ok: true,
      value: [{ operationId: 'op-1', prompt: 'ЗАПРОС ДЛЯ AI' }],
    });
    chat.view();
    send('Подготовить доклад');
    expect(await screen.findByDisplayValue('ЗАПРОС ДЛЯ AI')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Ответ AI (JSON)'), {
      target: { value: '{"ok":1}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Передать ответ' }));
    await waitFor(() => {
      expect(chat.reply).toHaveBeenCalledWith({
        operationId: 'op-1',
        text: '{"ok":1}',
      });
    });
  });

  it('marks files of an affected task as not read by the AI', async () => {
    const chat = setup();
    const task = {
      id: 'new-1',
      title: 'Подготовить доклад',
      status: { kind: 'todo' },
      columnId: 'todo',
      subtasks: [],
      comments: [],
      attachments: [{ id: 'a', name: 'условие.txt' }],
      addedOrder: 1,
    } as unknown as Task;
    chat.view([task]);
    send('Подготовить доклад');
    chat.answer(ok(proposal));
    expect(await screen.findByText(/условие.txt — не прочитан/)).toBeVisible();
  });

  it('saves the AI mode and says so when saving fails', async () => {
    const chat = setup('auto');
    chat.view();
    const select = await screen.findByLabelText('Режим AI');
    fireEvent.change(select, { target: { value: 'confirm' } });
    await waitFor(() => {
      expect(chat.apply).toHaveBeenCalledWith({
        expectedRevision: 4,
        commands: [{ kind: 'setting.set', key: 'aiMode', value: 'confirm' }],
      });
    });
    chat.apply.mockResolvedValueOnce({ ok: false } as never);
    fireEvent.change(select, { target: { value: 'auto' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /режим не изменён|Он не изменён/,
    );
  });
});
