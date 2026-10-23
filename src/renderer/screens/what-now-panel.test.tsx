import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../domain/task';
import type { AiScenarioResult } from '../../shared/contracts';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import { NowScreen } from './now-screen';
import { Temporal } from 'temporal-polyfill';

afterEach(cleanup);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Курсовая: собрать прототип',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
    ...overrides,
  };
}

function setup(replies: AiScenarioResult[], tasks: Task[] = [task()]) {
  const scenario = vi.fn(() =>
    Promise.resolve(
      replies.shift() ?? {
        ok: false as const,
        error: { kind: 'ProviderUnavailable', message: '' },
      },
    ),
  );
  window.flowpilot = { ai: { scenario } } as unknown as FlowPilotApi;
  const onStart = vi.fn();
  render(
    <NowScreen
      task={tasks[0]}
      allTasks={tasks}
      today={Temporal.PlainDate.from('2026-10-05')}
      workdays={new Set([1, 2, 3, 4, 5])}
      isLoading={false}
      hasTasks
      hasUndatedTasks={false}
      onStart={onStart}
      onOpenTask={vi.fn()}
    />,
  );
  return { scenario, onStart };
}

const recommendation = (taskId: string, subtaskId?: string) => ({
  ok: true as const,
  value: {
    kind: 'recommendation',
    answer: {
      action: subtaskId ? { taskId, subtaskId } : { taskId },
      reason: 'Срок ближе всего, а на задачу нужно несколько дней.',
    },
  },
});

const ask = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Что делать сейчас?' }));

describe('What now? on the Now screen', () => {
  it('opens without asking the AI anything', () => {
    const { scenario } = setup([]);
    expect(
      screen.getByRole('button', { name: 'Что делать сейчас?' }),
    ).toBeVisible();
    expect(scenario).not.toHaveBeenCalled();
  });

  it('asks once per press, even if pressed twice while waiting', async () => {
    const { scenario } = setup([recommendation('task-1')]);
    ask();
    ask();
    await screen.findByText(/Срок ближе всего/);
    expect(scenario).toHaveBeenCalledTimes(1);
    expect(scenario).toHaveBeenCalledWith({ scenario: 'whatNow' });
  });

  it('shows the recommended task with the reason, and Start starts that task', async () => {
    const { onStart } = setup(
      [recommendation('task-2')],
      [task(), task({ id: 'task-2', title: 'Прочитать главу 3' })],
    );
    ask();
    const card = await screen.findByRole('article', { name: 'Совет AI' });
    expect(card).toHaveTextContent('Прочитать главу 3');
    expect(card).toHaveTextContent(/Срок ближе всего/);
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-2' }),
    );
  });

  it('names the subtask and starts its parent task', async () => {
    const parent = task({
      subtasks: [
        {
          id: 's-1',
          title: 'Собрать источники',
          completed: false,
          position: 0,
        },
      ],
    });
    const { onStart } = setup([recommendation('task-1', 's-1')], [parent]);
    ask();
    expect(await screen.findByText(/Собрать источники/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
    expect(onStart).toHaveBeenCalledWith(parent);
  });

  it('asks again on Other', async () => {
    const { scenario } = setup([
      recommendation('task-1'),
      recommendation('task-1'),
    ]);
    ask();
    await screen.findByText(/Срок ближе всего/);
    fireEvent.click(screen.getByRole('button', { name: 'Другое' }));
    await vi.waitFor(() => {
      expect(scenario).toHaveBeenCalledTimes(2);
    });
  });

  it('explains honestly when nothing is available and assigns nothing', async () => {
    const { onStart } = setup([
      {
        ok: true,
        value: {
          kind: 'no-available-tasks',
          reason: 'Всё в ожидании или назначено на будущее.',
        },
      },
    ]);
    ask();
    expect(await screen.findByText(/Всё в ожидании/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Начать' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Другое' })).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('says the AI is unavailable and leaves the normal Now card alone', async () => {
    setup([{ ok: false, error: { kind: 'ProviderUnavailable', message: '' } }]);
    ask();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /AI сейчас недоступен/,
    );
    expect(
      screen.getByRole('button', { name: /Взять в работу/ }),
    ).toBeVisible();
    expect(screen.getByText('Курсовая: собрать прототип')).toBeVisible();
  });

  it('asks nothing about budget or duration', async () => {
    setup([recommendation('task-1')]);
    ask();
    await screen.findByText(/Срок ближе всего/);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(document.body.textContent).not.toMatch(/бюджет|длительност/i);
  });

  it('opens the reason with a button that a keyboard can operate', async () => {
    setup([recommendation('task-1')]);
    ask();
    const why = await screen.findByRole('button', { name: 'Почему' });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
  });
});
