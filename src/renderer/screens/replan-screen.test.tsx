import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../domain/task';
import type { AiScenarioResult } from '../../shared/contracts';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import { useReplan } from '../replan/use-replan';
import { ReplanScreen } from './replan-screen';

afterEach(cleanup);

type Resolver = (result: AiScenarioResult) => void;

const tasks = [
  { id: 'a', title: 'Курсовая' },
  { id: 'b', title: 'Лабораторная' },
] as unknown as Task[];

const proposal = {
  kind: 'confirmation-required',
  proposalId: 'p-1',
  rationale: 'Курсовая требует около четырёх дней; правило «Учебные проекты».',
  diff: {
    changes: [
      {
        commandIndex: 0,
        entityId: 'a',
        field: 'day',
        before: '2026-10-06',
        after: '2026-10-05',
      },
      { commandIndex: 1, entityId: 'b', field: 'aiRank', before: 4, after: 2 },
    ],
  },
  rejectedCommands: [],
};
const ok = (value: unknown): AiScenarioResult => ({ ok: true, value });
const fail = (kind: string): AiScenarioResult => ({
  ok: false,
  error: { kind, message: '' },
});

function setup(initialRevision = 3) {
  const waiting: Resolver[] = [];
  const scenario = vi.fn(
    () =>
      new Promise<AiScenarioResult>((resolve) => {
        waiting.push(resolve);
      }),
  );
  window.flowpilot = { ai: { scenario } } as unknown as FlowPilotApi;
  const onApplied = vi.fn(() => Promise.resolve());
  const undo = vi.fn(() => Promise.resolve('ok' as const));
  let revision = initialRevision;
  function Harness({ rev }: { rev: number }) {
    const replan = useReplan({ revision: rev, onApplied, undo });
    return (
      <>
        <button
          type="button"
          disabled={replan.state.phase === 'running'}
          onClick={replan.run}
        >
          Перестроить
        </button>
        <button type="button" onClick={replan.run}>
          Запустить принудительно
        </button>
        <ReplanScreen
          replan={replan}
          tasks={tasks}
          mode="confirm"
          loadMode={() => undefined}
        />
      </>
    );
  }
  const view = render(<Harness rev={revision} />);
  return {
    scenario,
    onApplied,
    undo,
    answer: (result: AiScenarioResult) => waiting.shift()?.(result),
    bump: () => {
      revision += 1;
      view.rerender(<Harness rev={revision} />);
    },
  };
}

const run = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Перестроить' }));

describe('Replan screen', () => {
  it('asks the AI for nothing until the button is pressed', () => {
    const { scenario } = setup();
    expect(scenario).not.toHaveBeenCalled();
    expect(screen.getByText(/Нажмите «Перестроить»/)).toBeVisible();
  });

  it('runs once per press and cannot be pressed again while waiting', () => {
    const { scenario } = setup();
    run();
    expect(screen.getByRole('button', { name: 'Перестроить' })).toBeDisabled();
    run();
    expect(scenario).toHaveBeenCalledTimes(1);
    expect(scenario).toHaveBeenCalledWith({ scenario: 'replan' });
  });

  it('ignores a second run that arrives while the first one is still waiting', () => {
    const { scenario } = setup();
    const force = screen.getByRole('button', {
      name: 'Запустить принудительно',
    });
    fireEvent.click(force);
    fireEvent.click(force);
    expect(scenario).toHaveBeenCalledTimes(1);
  });

  it('shows the old and the new value of every task it would change', async () => {
    const chat = setup();
    run();
    chat.answer(ok(proposal));
    const table = await screen.findByRole('table', { name: 'До и после' });
    const rows = screen.getAllByRole('row');
    expect(table).toBeVisible();
    expect(rows[1]).toHaveTextContent('Курсовая');
    expect(rows[1]).toHaveTextContent('06.10.2026');
    expect(rows[1]).toHaveTextContent('05.10.2026');
    expect(rows[2]).toHaveTextContent('Лабораторная');
    expect(rows[2]).toHaveTextContent('Порядок: 4');
    expect(rows[2]).toHaveTextContent('Порядок: 2');
    expect(chat.onApplied).not.toHaveBeenCalled();
  });

  it('keeps the reason closed until asked, and names the rule in it', async () => {
    const chat = setup();
    run();
    chat.answer(ok(proposal));
    const why = await screen.findByRole('button', { name: 'Основание' });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/правило «Учебные проекты»/)).toBeVisible();
  });

  it('applies the proposal on confirmation and then refreshes the data', async () => {
    const chat = setup();
    run();
    chat.answer(ok(proposal));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Применить изменения' }),
    );
    expect(chat.scenario).toHaveBeenLastCalledWith({
      scenario: 'confirm',
      proposalId: 'p-1',
    });
    chat.answer(ok({ kind: 'applied', revision: 4, rejectedCommands: [] }));
    expect(await screen.findByText('Порядок перестроен.')).toBeVisible();
    expect(chat.onApplied).toHaveBeenCalledTimes(1);
  });

  it('marks a proposal stale when the data changed after it was built', async () => {
    const chat = setup();
    run();
    chat.answer(ok(proposal));
    await screen.findByRole('button', { name: 'Применить изменения' });
    chat.bump();
    expect(
      await screen.findByText(/Данные изменились после подготовки/),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Применить изменения' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Запросить заново' }));
    await waitFor(() => {
      expect(chat.scenario).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the result and an undo button in auto mode', async () => {
    const chat = setup();
    run();
    chat.answer(ok({ kind: 'applied', revision: 4, rejectedCommands: [] }));
    expect(await screen.findByText('Порядок перестроен.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(await screen.findByText('Изменения отменены.')).toBeVisible();
    expect(chat.undo).toHaveBeenCalledTimes(1);
  });

  it('keeps the current order when the person declines', async () => {
    const chat = setup();
    run();
    chat.answer(ok(proposal));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Оставить текущий порядок' }),
    );
    expect(chat.scenario).toHaveBeenLastCalledWith({
      scenario: 'reject',
      proposalId: 'p-1',
    });
    chat.answer(
      ok({ kind: 'rejected', error: { kind: 'Declined', message: '' } }),
    );
    expect(await screen.findByText(/Порядок не изменён/)).toBeVisible();
    expect(chat.onApplied).not.toHaveBeenCalled();
  });

  it('says in words that the AI is unavailable and changes nothing', async () => {
    const chat = setup();
    run();
    chat.answer(fail('ProviderUnavailable'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /AI сейчас недоступен/,
    );
    expect(chat.onApplied).not.toHaveBeenCalled();
  });
});
