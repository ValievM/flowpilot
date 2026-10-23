import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../domain/task';
import { NowScreen } from './now-screen';

afterEach(cleanup);

const today = Temporal.PlainDate.from('2026-10-05');
const workdays = new Set([1, 2, 3, 4, 5]);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'now-task',
    title: 'Курсовая: собрать рабочий прототип',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
    ...overrides,
  };
}

function renderNow(current: Task | undefined, onStart = vi.fn()) {
  render(
    <NowScreen
      task={current}
      allTasks={current ? [current] : []}
      today={today}
      workdays={workdays}
      isLoading={false}
      hasTasks={current !== undefined}
      hasUndatedTasks={false}
      onStart={onStart}
      onOpenTask={vi.fn()}
    />,
  );
  return { onStart };
}

describe('Now screen', () => {
  it('does not print the selection rule until it is asked for', () => {
    renderNow(task());
    const details = screen.getByText('Почему эта задача').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText(/ближайшему сроку/)).not.toBeVisible();
    fireEvent.click(screen.getByText('Почему эта задача'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText(/ближайшему сроку/)).toBeVisible();
  });

  it('shows an overdue task as a compact label with the date', () => {
    renderNow(task({ deadline: Temporal.PlainDate.from('2026-10-02') }));
    expect(screen.getByText('Просрочено · 2 октября')).toBeVisible();
    expect(screen.queryByText(/приблизительной оценке/)).toBeNull();
  });

  it('keeps the estimate caveat with a risk that comes from an estimate', () => {
    renderNow(
      task({
        deadline: Temporal.PlainDate.from('2026-10-09'),
        estimate: { unit: 'workdays', value: 5 },
      }),
    );
    expect(screen.getByText('Риск не успеть')).toBeVisible();
    fireEvent.click(screen.getByText('Почему эта задача'));
    expect(screen.getByText(/приблизительной оценке/)).toBeVisible();
  });

  it('starts the task and relabels the button for one already in progress', () => {
    const { onStart } = renderNow(task());
    fireEvent.click(screen.getByRole('button', { name: 'Взять в работу' }));
    expect(onStart).toHaveBeenCalledOnce();
    cleanup();
    renderNow(task({ status: { kind: 'doing' } }));
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeVisible();
  });

  it('keeps the task title as the main heading and Now as a quiet one', () => {
    renderNow(task());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Сейчас',
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Курсовая: собрать рабочий прототип/,
      }),
    ).toBeVisible();
  });
});
