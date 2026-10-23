import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../domain/task';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import type { ScheduleSnapshots } from '../../shared/schedule-contracts';
import { ScheduleContext } from '../schedule/schedule-context';
import { NowScreen } from './now-screen';
import { ScheduleSources } from './schedule-sources';
import { TodayScreen } from './today-screen';

afterEach(cleanup);

const zone = Temporal.Now.timeZoneId();
const today = Temporal.PlainDate.from('2026-10-05');

function at(time: string): string {
  return today
    .toZonedDateTime({
      timeZone: zone,
      plainTime: Temporal.PlainTime.from(time),
    })
    .toInstant()
    .toString();
}

const mathClass = {
  key: 'math',
  source: 'ics' as const,
  title: 'Математика',
  startUtc: at('14:30'),
  endUtc: at('16:00'),
  timeZone: zone,
  place: 'ауд. 204',
};

function snapshot(
  overrides: Record<string, unknown> = {},
  events: unknown[] = [mathClass],
): ScheduleSnapshots {
  return [
    {
      source: 'ics',
      fetchedAt: at('12:50'),
      status: 'ok',
      lastError: null,
      ageMilliseconds: 0,
      events,
      ...overrides,
    },
  ] as unknown as ScheduleSnapshots;
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Подготовить доклад',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
    day: today,
    ...overrides,
  };
}

function renderToday(
  snapshots: ScheduleSnapshots,
  time: string,
  tasks: Task[] = [task()],
) {
  render(
    <ScheduleContext.Provider value={{ snapshots, reload: vi.fn() }}>
      <TodayScreen
        tasks={tasks}
        hasTasks
        hasUndatedTasks={false}
        available={tasks}
        workdays={new Set([1, 2, 3, 4, 5])}
        today={today}
        now={Temporal.PlainTime.from(time)}
        onOpenSources={vi.fn()}
        todayLabel="Сегодня, 5 октября"
        onStart={vi.fn()}
        onOpenTask={vi.fn()}
      />
    </ScheduleContext.Provider>,
  );
}

describe('schedule on Today', () => {
  it('shows the next classes with the age of the snapshot', () => {
    renderToday(snapshot(), '13:20');
    const strip = screen.getByRole('region', { name: 'Расписание' });
    expect(strip).toHaveTextContent('Математика');
    expect(strip).toHaveTextContent('14:30 — 16:00');
    expect(strip).toHaveTextContent('ауд. 204');
    expect(strip).toHaveTextContent(/снимок сегодня, 12:50/);
  });

  it('without a snapshot never says free and invites an import', () => {
    renderToday([], '19:00');
    const strip = screen.getByRole('region', { name: 'Расписание' });
    expect(strip).not.toHaveTextContent(/свободно/i);
    expect(strip).toHaveTextContent(/Импортируйте файл/);
    expect(
      screen.getByRole('button', { name: 'Открыть источники' }),
    ).toBeVisible();
  });

  it('says free in the evening only for a fresh snapshot with classes', () => {
    renderToday(snapshot(), '19:00');
    expect(screen.getByText('Свободно от занятий')).toBeVisible();
  });

  it('keeps the classes and shows the age when the source failed, and never says free', () => {
    renderToday(snapshot({ status: 'error', lastError: 'нет сети' }), '19:00');
    expect(screen.getByRole('alert')).toHaveTextContent(/не обновлён/);
    expect(screen.getByRole('alert')).toHaveTextContent(/сегодня, 12:50/);
    expect(screen.queryByText('Свободно от занятий')).toBeNull();
    renderToday(snapshot({ status: 'error', lastError: 'нет сети' }), '13:20');
    expect(screen.getAllByText('Математика').length).toBeGreaterThan(0);
  });

  it('shows a conflict when a timed task falls inside a class, and moves nothing', () => {
    renderToday(snapshot(), '13:20', [
      task({ time: Temporal.PlainTime.from('15:00') }),
    ]);
    expect(screen.getByRole('note')).toHaveTextContent(
      /Пересекается с занятием «Математика»/,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/Ничего не сдвинуто/);
  });

  it('does not draw a task without a time as an hour block', () => {
    renderToday(snapshot(), '13:20', [task()]);
    expect(screen.queryByRole('note')).toBeNull();
    const row = screen
      .getByRole('button', { name: 'Открыть задачу: Подготовить доклад' })
      .closest('li');
    expect(row?.textContent ?? '').not.toMatch(/\d{2}:\d{2}/);
  });
});

describe('schedule on Now', () => {
  it('names the nearest class with time and place', () => {
    render(
      <ScheduleContext.Provider
        value={{ snapshots: snapshot(), reload: vi.fn() }}
      >
        <NowScreen
          task={task()}
          allTasks={[task()]}
          today={today}
          now={Temporal.PlainTime.from('13:20')}
          workdays={new Set([1, 2, 3, 4, 5])}
          isLoading={false}
          hasTasks
          hasUndatedTasks={false}
          onStart={vi.fn()}
          onOpenTask={vi.fn()}
        />
      </ScheduleContext.Provider>,
    );
    expect(screen.getByText(/Ближайшее занятие:/)).toBeVisible();
    expect(
      screen.getByText(/14:30 — 16:00 · Математика · ауд. 204/),
    ).toBeVisible();
  });
});

function sourcesApi(preview: unknown) {
  const confirmImport = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: snapshot() }),
  );
  const importFile = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: preview }),
  );
  window.flowpilot = {
    schedule: { importFile, confirmImport, list: vi.fn() },
  } as unknown as FlowPilotApi;
  return { confirmImport, importFile };
}

describe('schedule sources in settings', () => {
  const preview = {
    token: 'token-1',
    found: 10,
    problemCount: 1,
    problems: [{ line: 63, reason: 'Не указаны обязательные UID и DTSTART.' }],
    firstDate: '2026-10-01',
    lastDate: '2026-10-10',
  };

  it('shows a preview first and loads nothing until it is confirmed', async () => {
    const api = sourcesApi(preview);
    const reload = vi.fn(() => Promise.resolve());
    render(
      <ScheduleContext.Provider value={{ snapshots: [], reload }}>
        <ScheduleSources today={today} onApply={vi.fn()} onChanged={vi.fn()} />
      </ScheduleContext.Provider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Импортировать расписание (.ics)' }),
    );
    const group = await screen.findByRole('group', {
      name: 'Предпросмотр импорта',
    });
    expect(group).toHaveTextContent('Найдено событий: 10 · проблем: 1');
    expect(group).toHaveTextContent('Строка 63');
    expect(api.confirmImport).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Загрузить 10 событий' }),
    );
    await waitFor(() => {
      expect(api.confirmImport).toHaveBeenCalledWith({ token: 'token-1' });
    });
    expect(await screen.findByText(/Загружено событий: 10/)).toBeVisible();
    expect(reload).toHaveBeenCalled();
  });

  it('says in words that the file could not be read', async () => {
    window.flowpilot = {
      schedule: {
        importFile: () =>
          Promise.resolve({
            ok: false,
            error: {
              kind: 'IcsInvalid',
              problems: [{ line: 1, reason: 'Неверный формат.' }],
            },
          }),
        confirmImport: vi.fn(),
        list: vi.fn(),
      },
    } as unknown as FlowPilotApi;
    render(
      <ScheduleContext.Provider value={{ snapshots: [], reload: vi.fn() }}>
        <ScheduleSources today={today} onApply={vi.fn()} onChanged={vi.fn()} />
      </ScheduleContext.Provider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Импортировать расписание (.ics)' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /не удалось прочитать/,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Строка 1: Неверный формат.',
    );
  });
});

describe('manual classes', () => {
  function setup() {
    const onApply = vi.fn(() => Promise.resolve(true));
    window.flowpilot = {
      schedule: { list: vi.fn() },
    } as unknown as FlowPilotApi;
    render(
      <ScheduleContext.Provider
        value={{ snapshots: [], reload: vi.fn(() => Promise.resolve()) }}
      >
        <ScheduleSources today={today} onApply={onApply} onChanged={vi.fn()} />
      </ScheduleContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Добавить занятие' }));
    return { onApply };
  }

  it('creates a repeating class from the form', async () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByLabelText('Название занятия'), {
      target: { value: 'Тренировка' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Пн' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ср' }));
    fireEvent.change(screen.getByLabelText('Начало'), {
      target: { value: '18:00' },
    });
    fireEvent.change(screen.getByLabelText('Конец'), {
      target: { value: '19:00' },
    });
    fireEvent.change(screen.getByLabelText('Место (необязательно)'), {
      target: { value: 'зал' },
    });
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'Добавить занятие' })
        .at(-1) as HTMLElement,
    );
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    const [commands] = onApply.mock.calls[0] as unknown as [
      { kind: string; event: Record<string, unknown> }[],
    ];
    expect(commands[0]).toMatchObject({
      kind: 'schedule.manual.add',
      event: {
        title: 'Тренировка',
        weekdays: [1, 3],
        startTime: '18:00',
        endTime: '19:00',
        place: 'зал',
      },
    });
  });

  it.each([
    ['', true, /Введите название/],
    ['Тренировка', false, /Выберите хотя бы один день/],
  ])(
    'refuses title "%s" (days chosen: %s) in words and sends nothing',
    (title, withDay, message) => {
      const { onApply } = setup();
      fireEvent.change(screen.getByLabelText('Название занятия'), {
        target: { value: title },
      });
      if (withDay)
        fireEvent.click(screen.getByRole('checkbox', { name: 'Пн' }));
      fireEvent.click(
        screen
          .getAllByRole('button', { name: 'Добавить занятие' })
          .at(-1) as HTMLElement,
      );
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(onApply).not.toHaveBeenCalled();
    },
  );
});
