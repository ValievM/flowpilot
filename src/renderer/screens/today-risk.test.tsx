import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import {
  fakeApi,
  mockSystemTheme,
  taskRecord,
} from '../test-support/fake-flowpilot';

function showTasks(tasks: Parameters<typeof taskRecord>[0][]): void {
  mockSystemTheme(false);
  const api = fakeApi(tasks.map(taskRecord)).api;
  Object.defineProperty(window, 'flowpilot', {
    configurable: true,
    value: api,
  });
  render(<App />);
}

function setLocalDate(date: string): void {
  vi.setSystemTime(new Date(`${date}T09:00:00`));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

describe('today risk and rollover display', () => {
  it('shows approximate risk and unknown workload with explanatory text', async () => {
    setLocalDate('2026-10-05');
    showTasks([
      {
        id: 'tight',
        title: 'Равный запас',
        day: '2026-10-05',
        deadline: '2026-10-09',
        estimate: { unit: 'workdays', value: 5 },
      },
      {
        id: 'unknown',
        title: 'Без оценки',
        day: '2026-10-05',
        deadline: '2026-10-09',
      },
    ]);
    expect(
      await screen.findAllByText(
        /до срока 5 рабочих дней.*запас исчерпан.*приблизительной оценке/i,
      ),
    ).toHaveLength(2);
    expect(screen.getByText(/срок есть, объём неизвестен/i)).toBeVisible();
    expect(screen.getAllByText(/Риск не успеть/).length).toBeGreaterThan(0);
  });

  it('shows short and overdue risk from the selected local date', async () => {
    setLocalDate('2026-10-08');
    showTasks([
      {
        id: 'short',
        title: 'Два дня',
        day: '2026-10-08',
        deadline: '2026-10-09',
        estimate: { unit: 'workdays', value: 4 },
      },
    ]);
    expect(
      await screen.findAllByText(
        /осталось 2 рабочих дня.*оценка остатка 4 рабочих дня.*срок не выдержать/i,
      ),
    ).toHaveLength(2);
    cleanup();
    setLocalDate('2026-10-09');
    showTasks([
      {
        id: 'late',
        title: 'Срок позади',
        day: '2026-10-09',
        deadline: '2026-10-08',
        estimate: { unit: 'workdays', value: 2 },
      },
    ]);
    await screen.findByRole('heading', { name: 'Срок позади', level: 3 });
    expect(screen.getAllByText(/Срок прошёл/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Дата срока.*по приблизительной оценке/i),
    ).toHaveLength(2);
  });

  it('shows a yesterday task as rolled over after midnight without changing persisted source', async () => {
    setLocalDate('2026-10-06');
    const yesterdayTask = taskRecord({
      id: 'yesterday',
      title: 'Продолжить вчерашнее',
      day: '2026-10-05',
      status: { kind: 'doing' },
    });
    const api = fakeApi([yesterdayTask]);
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: api.api,
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', {
        name: 'Продолжить вчерашнее',
        level: 3,
      }),
    ).toBeVisible();
    expect(screen.getByText('Перенесено со вчера')).toBeVisible();
    expect(api.snapshot().tasks[0]?.day).toBe('2026-10-05');
  });

  it('refreshes availability when the window regains focus after its scheduled time', async () => {
    setLocalDate('2026-10-05');
    showTasks([
      {
        id: 'timed',
        title: 'Задача после полудня',
        day: '2026-10-05',
        time: '12:00',
      },
    ]);
    expect(
      await screen.findByRole('heading', { name: 'Сегодня, 5 октября' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Сейчас' }));
    expect(
      screen.getByRole('heading', { name: 'Нет доступных дел' }),
    ).toBeVisible();
    setLocalDate('2026-10-05');
    vi.setSystemTime(new Date('2026-10-05T13:00:00'));
    fireEvent.focus(window);
    expect(
      await screen.findByRole('heading', { name: 'Задача после полудня' }),
    ).toBeVisible();
    expect(Temporal.Now.plainDateISO().toString()).toBe('2026-10-05');
  });
});
