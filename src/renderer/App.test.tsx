import { createRef } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Temporal } from 'temporal-polyfill';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { QuickAddDialog } from './components/quick-add-dialog';
import { fakeApi, taskRecord } from './test-support/fake-flowpilot';
import { mockSystemTheme } from './test-support/mock-system-theme';
import { isThemeChoice } from './theme/use-theme';
import { isMotionChoice } from './use-reduced-motion';

if (
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal') ===
  undefined
) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      value(this: HTMLDialogElement): void {
        this.setAttribute('open', '');
      },
    },
    close: {
      value(this: HTMLDialogElement): void {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    },
  });
}

const TEST_NOW = '2026-10-05T12:00:00Z';
const TEST_TODAY = Temporal.Instant.from(TEST_NOW)
  .toZonedDateTimeISO(Temporal.Now.timeZoneId())
  .toPlainDate()
  .toString();

function renderApp(tasks: Parameters<typeof taskRecord>[0][] = []) {
  mockSystemTheme(false);
  const fake = fakeApi(tasks.map(taskRecord), () => TEST_NOW);
  Object.defineProperty(window, 'flowpilot', {
    configurable: true,
    value: fake.api,
  });
  return { ...render(<App />), ...fake };
}

const today = (): string => TEST_TODAY;

describe('persisted today and now screens', () => {
  beforeEach(() => {
    vi.spyOn(Temporal.Now, 'plainDateISO').mockReturnValue(
      Temporal.PlainDate.from('2026-10-05'),
    );
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-motion-choice');
    document.documentElement.removeAttribute('data-reduce-motion');
    vi.restoreAllMocks();
  });

  it('uses the main appearance API for manual theme choices', async () => {
    mockSystemTheme(true);
    const fake = fakeApi();
    const setTheme = vi.spyOn(fake.api.appearance, 'setTheme');
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: fake.api,
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    expect(window.localStorage.getItem('flowpilot-theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: /Тема:/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith({ theme: 'light' });
    });
    expect(window.localStorage.getItem('flowpilot-theme')).toBeNull();
  });
  it('keeps the persisted appearance after a failed theme save and retries', async () => {
    mockSystemTheme(true);
    const fake = fakeApi();
    let persistedTheme = 'system';
    let nativeTheme = persistedTheme;
    const setTheme = vi
      .spyOn(fake.api.appearance, 'setTheme')
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: false, error: 'InternalError' }),
      )
      .mockImplementation(({ theme }) => {
        persistedTheme = theme;
        nativeTheme = theme;
        return Promise.resolve({ ok: true, value: null });
      });
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: fake.api,
    });
    render(<App />);
    const themeButton = screen.getByRole('button', {
      name: 'Тема: как в системе',
    });
    fireEvent.click(themeButton);
    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(persistedTheme).toBe('system');
      expect(nativeTheme).toBe('system');
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(themeButton).toHaveAccessibleName('Тема: как в системе');
    });

    fireEvent.click(themeButton);
    await waitFor(() => {
      expect(persistedTheme).toBe('light');
      expect(nativeTheme).toBe('light');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(themeButton).toHaveAccessibleName('Тема: светлая');
    });
  });
  it('marks the titlebar action as non-draggable', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    const addButton = screen.getByRole('button', { name: 'Задача' });

    expect(addButton).toHaveClass('no-drag');
    expect(addButton.closest('.drag-region')).not.toBeNull();
  });

  it('rejects unknown theme values and keeps navigation keyboard accessible', async () => {
    expect(isThemeChoice('ultraviolet')).toBe(false);
    expect(isThemeChoice('dark')).toBe(true);
    renderApp();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    const nav = screen.getByRole('navigation', { name: 'Представления' });
    expect(
      within(nav)
        .getAllByRole('button')
        .every((button) => button.tabIndex === 0),
    ).toBe(true);
    expect(
      within(nav).getByRole('button', { name: 'Сегодня' }),
    ).toHaveAttribute('aria-current', 'page');
  });
  it('opens saved theme, workday, and motion settings with accessible choices', async () => {
    const app = renderApp();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(screen.getByRole('combobox', { name: 'Тема' })).toHaveValue(
      'system',
    );
    expect(
      screen.getByRole('combobox', { name: 'Уменьшить движение' }),
    ).toHaveValue('system');
    const group = screen.getByRole('group', {
      name: 'Дни недели, учитываемые при расчёте срока',
    });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(7);
    for (const [day, checked] of [
      ['Понедельник', true],
      ['Вторник', true],
      ['Среда', true],
      ['Четверг', true],
      ['Пятница', true],
      ['Суббота', false],
      ['Воскресенье', false],
    ] as const) {
      expect(screen.getByRole('checkbox', { name: day })).toHaveProperty(
        'checked',
        checked,
      );
    }
    expect(app.settingsCalls).toEqual([]);
  });

  it('persists theme changes and keeps the system preference available', async () => {
    const changeSystemTheme = mockSystemTheme(true);
    const app = fakeApi();
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: app.api,
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Тема' }), {
      target: { value: 'dark' },
    });
    await waitFor(() => {
      expect(app.snapshot().settings.theme).toBe('dark');
    });
    cleanup();
    render(<App initialTheme="dark" />);
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(screen.getByRole('combobox', { name: 'Тема' })).toHaveValue('dark');
    fireEvent.change(screen.getByRole('combobox', { name: 'Тема' }), {
      target: { value: 'system' },
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => {
      changeSystemTheme(false);
    });
    expect(document.documentElement.dataset.theme).toBe('light');
    await waitFor(() => {
      expect(app.snapshot().settings.theme).toBe('system');
    });
    expect(isThemeChoice('ultraviolet')).toBe(false);
  });

  it.each([
    ['Доска', 'Доска'],
    ['Все задачи', 'Все задачи'],
  ])(
    'updates the deadline risk marker in the %s view when workdays change',
    async (viewLabel, heading) => {
      const app = renderApp([
        {
          id: 'view-risk',
          title: 'Risk view task',
          deadline: '2026-10-09',
          estimate: { unit: 'workdays', value: 4 },
        },
      ]);
      fireEvent.click(screen.getByRole('button', { name: viewLabel }));
      expect(
        await screen.findByRole('heading', { name: 'Risk view task' }),
      ).toBeVisible();
      expect(screen.getByRole('heading', { name: heading })).toBeVisible();
      expect(
        screen.queryByText(/До срока .*запас исчерпан/),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Пятница' }));
      await waitFor(() => {
        expect(app.snapshot().settings.workdays).toEqual([1, 2, 3, 4]);
      });
      fireEvent.click(screen.getByRole('button', { name: viewLabel }));

      expect(
        await screen.findByText(
          /До срока 4 рабочих дня, оценка остатка 4 рабочих дня: запас исчерпан/,
        ),
      ).toBeVisible();
    },
  );
  it.each([['Доска'], ['Все задачи']])(
    'shows neutral unknown and semantic risk styles and titles in the %s view',
    async (viewLabel) => {
      renderApp([
        {
          id: 'unknown-risk',
          title: 'Unknown estimate task',
          deadline: '2026-10-09',
        },
        {
          id: 'tight-risk',
          title: 'Tight deadline task',
          deadline: '2026-10-09',
          estimate: { unit: 'workdays', value: 5 },
        },
        {
          id: 'short-risk',
          title: 'Short deadline task',
          deadline: '2026-10-09',
          estimate: { unit: 'workdays', value: 6 },
        },
        {
          id: 'overdue-risk',
          title: 'Overdue deadline task',
          deadline: '2026-10-04',
          estimate: { unit: 'workdays', value: 2 },
        },
      ]);
      fireEvent.click(screen.getByRole('button', { name: viewLabel }));

      const unknownRisk = await screen.findByText(
        'Срок есть, объём неизвестен. По приблизительной оценке.',
      );
      expect(unknownRisk).toHaveAttribute('data-risk-kind', 'unknown');
      expect(unknownRisk).toHaveClass('risk-label', 'risk-unknown');
      expect(unknownRisk).not.toHaveClass('is-risk');

      const tightRisk = screen.getByText(
        /До срока 5 рабочих дней, оценка остатка 5 рабочих дней: запас исчерпан/,
      );
      expect(tightRisk).toHaveAttribute('data-risk-kind', 'tight');
      expect(tightRisk).toHaveClass('risk-label', 'is-risk');
      expect(tightRisk).toHaveAttribute('title', 'Риск не успеть');
      const shortRisk = screen.getByText(/при этой оценке срок не выдержать/);
      expect(shortRisk).toHaveAttribute('data-risk-kind', 'short');
      expect(shortRisk).toHaveClass('risk-label', 'is-risk');
      expect(shortRisk).toHaveAttribute('title', 'Риск не успеть');

      const overdueRisk = screen.getByText(
        'Дата срока — 04.10.2026. По приблизительной оценке.',
      );
      expect(overdueRisk).toHaveAttribute('data-risk-kind', 'overdue');
      expect(overdueRisk).toHaveClass('risk-label', 'is-risk');
      expect(overdueRisk).toHaveAttribute('title', 'Срок прошёл');
    },
  );

  it('persists workdays, reloads them, and recalculates visible deadline risk', async () => {
    const app = fakeApi(
      [
        taskRecord({
          id: 'workday-risk',
          day: today(),
          deadline: '2026-10-09',
          estimate: { unit: 'workdays', value: 4 },
        }),
      ],
      () => TEST_NOW,
    );
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: app.api,
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'workday-risk', level: 3 });
    expect(screen.queryByText(/Риск не успеть/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Понедельник' }));
    await waitFor(() => {
      expect(app.settingsCalls).toEqual([
        { key: 'workdays', value: [2, 3, 4, 5], expectedRevision: 0 },
      ]);
    });
    expect(app.snapshot().settings.workdays).toEqual([2, 3, 4, 5]);
    fireEvent.click(screen.getByRole('button', { name: 'Сегодня' }));
    expect(screen.getByText(/Риск не успеть/)).toBeVisible();
    cleanup();
    render(<App />);
    await screen.findByRole('heading', { name: 'workday-risk', level: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(
      screen.getByRole('checkbox', { name: 'Понедельник' }),
    ).not.toBeChecked();
  });

  it('rejects an empty workday set without saving or changing the selected day', async () => {
    const app = fakeApi([], () => TEST_NOW, [1]);
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: app.api,
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Понедельник' }));
    expect(
      await screen.findByText('Выберите хотя бы один рабочий день.'),
    ).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Понедельник' })).toBeChecked();
    expect(app.settingsCalls).toEqual([]);
  });

  it('shows a settings save failure and retains the persisted value', async () => {
    const app = renderApp();
    app.setSettingsFailure();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Пятница' }));
    const alerts = await screen.findAllByText(
      'Не удалось сохранить рабочие дни. Настройка не изменена; попробуйте снова.',
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: 'Пятница' })).toBeChecked();
    expect(app.snapshot().settings.workdays).toEqual([1, 2, 3, 4, 5]);
    expect(screen.getByRole('status')).toHaveTextContent('Ошибка сохранения');
  });

  it('defaults reduced motion to the system and persists manual overrides', async () => {
    const changeSystemMotion = mockSystemTheme(true, false);
    const fake = fakeApi();
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: fake.api,
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    expect(window.localStorage.getItem('flowpilot-reduce-motion')).toBeNull();
    expect(document.documentElement).toHaveAttribute('data-reduce-motion');
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => {
      changeSystemMotion(false);
    });
    expect(document.documentElement).not.toHaveAttribute('data-reduce-motion');
    act(() => {
      changeSystemMotion(true);
    });
    expect(document.documentElement).toHaveAttribute('data-reduce-motion');
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Уменьшить движение' }),
      {
        target: { value: 'full' },
      },
    );
    expect(window.localStorage.getItem('flowpilot-reduce-motion')).toBe('full');
    expect(document.documentElement).not.toHaveAttribute('data-reduce-motion');
    expect(document.documentElement).toHaveAttribute(
      'data-motion-choice',
      'full',
    );
    expect(isMotionChoice('none')).toBe(false);
    cleanup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    expect(document.documentElement).not.toHaveAttribute('data-reduce-motion');
    expect(document.documentElement).toHaveAttribute(
      'data-motion-choice',
      'full',
    );
  });

  it('shows empty persisted state and never uses sample tasks', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: 'Сегодня пока пусто' }),
    ).toBeVisible();
    expect(
      screen.queryByText('Курсовая: собрать рабочий прототип'),
    ).not.toBeInTheDocument();
  });
  it('shows the matching empty state in Сейчас when the saved snapshot is empty', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Сейчас' }));
    expect(
      screen.getByRole('heading', { name: 'Сегодня пока пусто' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Добавьте задачу — она сохранится и появится в сегодняшнем списке.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/ожидают ответа, завершены или назначены на будущее/i),
    ).not.toBeInTheDocument();
  });

  it('shows a saved today task in Сегодня and Сейчас', async () => {
    renderApp([{ id: 'today-task', title: 'Текущая задача', day: today() }]);
    expect(
      await screen.findByRole('heading', {
        name: 'Текущая задача',
        level: 3,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Сейчас' }));
    expect(
      screen.getByRole('heading', { name: 'Текущая задача' }),
    ).toBeVisible();
  });

  it('does not offer tomorrow, waiting, or completed tasks as available work', async () => {
    const tomorrow = Temporal.PlainDate.from(today())
      .add({ days: 1 })
      .toString();
    renderApp([
      { id: 'tomorrow', title: 'Завтрашняя задача', day: tomorrow },
      {
        id: 'waiting',
        day: today(),
        status: { kind: 'waiting', reason: 'Ответ' },
      },
      { id: 'done', day: today(), status: { kind: 'done' } },
    ]);
    expect(
      await screen.findByRole('heading', { name: 'Нет доступных дел' }),
    ).toBeVisible();
    expect(
      screen.getByText(/ожидают ответа, уже готовы или назначены на будущее/i),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Сейчас' }));
    expect(
      screen.queryByRole('heading', { name: 'Завтрашняя задача' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Взять в работу' }),
    ).not.toBeInTheDocument();
  });

  it('explains an unassigned unfinished task in Сейчас', async () => {
    renderApp([{ id: 'undated-task' }]);
    await screen.findByRole('heading', { name: 'Нет доступных дел' });
    fireEvent.click(screen.getByRole('button', { name: 'Сейчас' }));
    expect(
      screen.getByRole('heading', { name: 'Нет доступных дел' }),
    ).toBeVisible();
    expect(screen.getByText(/есть задачи без назначенного дня/i)).toBeVisible();
    expect(screen.queryByText(/назначены на будущее/i)).not.toBeInTheDocument();
  });

  it('shows an apply error when starting a task is rejected', async () => {
    const app = renderApp([{ id: 'rejected-task', day: today() }]);
    await screen.findByRole('heading', { name: 'rejected-task', level: 3 });
    app.setAlwaysReject();
    fireEvent.click(screen.getByRole('button', { name: 'Взять в работу' }));
    expect(await screen.findByText(/данные не изменены/i)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Ошибка сохранения');
  });

  it('shows the scheduled-for-future reason in Сейчас', async () => {
    const tomorrow = Temporal.PlainDate.from(today())
      .add({ days: 1 })
      .toString();
    renderApp([{ id: 'future-task', day: tomorrow }]);
    await screen.findByRole('heading', { name: 'Нет доступных дел' });
    fireEvent.click(screen.getByRole('button', { name: 'Сейчас' }));
    expect(
      screen.getByRole('heading', { name: 'Нет доступных дел' }),
    ).toBeVisible();
    expect(screen.getByText(/назначены на будущее/i)).toBeVisible();
  });

  it.each([
    [
      'value error',
      () => Promise.resolve({ ok: false as const, error: 'InternalError' }),
    ],
    ['rejected promise', () => Promise.reject(new Error('IPC unavailable'))],
  ])(
    'shows task data and retries a %s clock failure',
    async (_name, firstInfo) => {
      mockSystemTheme(false);
      const fake = fakeApi(
        [taskRecord({ id: 'clock-task', day: today() })],
        () => TEST_NOW,
      );
      const loadTime = fake.api.app.info.bind(fake.api.app);
      const info = vi
        .fn()
        .mockImplementationOnce(firstInfo)
        .mockImplementation(() => loadTime());
      fake.api.app.info = info;
      Object.defineProperty(window, 'flowpilot', {
        configurable: true,
        value: fake.api,
      });
      render(<App />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /не удалось получить текущее время/i,
      );
      expect(
        await screen.findByRole('heading', { name: 'clock-task', level: 3 }),
      ).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', { name: 'Повторить получение времени' }),
      );

      await waitFor(() => {
        expect(info).toHaveBeenCalledTimes(2);
      });
      expect(
        screen.queryByText(/не удалось получить текущее время/i),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'clock-task', level: 3 }),
      ).toBeVisible();
    },
  );
  it('rolls yesterday work over at midnight without remounting', async () => {
    mockSystemTheme(false);
    const atLocalTime = (day: string, time: string): string =>
      Temporal.PlainDate.from(day)
        .toZonedDateTime({
          timeZone: Temporal.Now.timeZoneId(),
          plainTime: Temporal.PlainTime.from(time),
        })
        .toInstant()
        .toString();
    let now = atLocalTime('2026-10-05', '23:59');
    const fake = fakeApi(
      [
        taskRecord({
          id: 'midnight-task',
          title: 'Вчерашнее дело',
          day: '2026-10-05',
          status: { kind: 'doing' },
        }),
      ],
      () => now,
    );
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: fake.api,
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /5 октября/i }),
    ).toBeVisible();
    now = atLocalTime('2026-10-06', '00:00');
    fireEvent.focus(window);
    expect(
      await screen.findByRole('heading', { name: /6 октября/i }),
    ).toBeVisible();
    expect(screen.getByText('Перенесено со вчера.')).toBeVisible();
  });

  it('keeps snapshot-load failures separate from command-save status', async () => {
    mockSystemTheme(false);
    const fake = fakeApi();
    fake.setLoadFailure();
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: fake.api,
    });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /не удалось загрузить сохранённые задачи/i,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Сохранено');
    expect(screen.queryByText('Ошибка сохранения')).not.toBeInTheDocument();
  });
  it('shows loading then recovers after retrying a source error', async () => {
    mockSystemTheme(false);
    const fake = fakeApi();
    fake.setLoadFailure();
    const load = vi.spyOn(fake.api.snapshot, 'load');
    Object.defineProperty(window, 'flowpilot', {
      configurable: true,
      value: fake.api,
    });
    render(<App />);
    expect(screen.getByText(/загружаем сохранённые задачи/i)).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /не удалось загрузить сохранённые задачи/i,
    );
    fake.setLoadFailure(false);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByRole('heading', { name: 'Сегодня пока пусто' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('retains text typed during an asynchronous save', async () => {
    let resolveSave!: (saved: boolean) => void;
    const close = vi.fn();
    const addButtonRef = createRef<HTMLButtonElement>();
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const app = render(
      <QuickAddDialog
        open
        onClose={close}
        onSubmit={onSubmit}
        addButtonRef={addButtonRef}
      />,
    );
    const field = screen.getByLabelText('Что нужно сделать?');
    fireEvent.change(field, { target: { value: 'Отправленная задача' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    fireEvent.change(field, { target: { value: 'Следующая задача' } });
    resolveSave(true);
    await waitFor(() => {
      expect(close).toHaveBeenCalledOnce();
    });
    app.rerender(
      <QuickAddDialog
        open
        onClose={close}
        onSubmit={onSubmit}
        addButtonRef={addButtonRef}
      />,
    );
    expect(screen.getByLabelText('Что нужно сделать?')).toHaveValue(
      'Следующая задача',
    );
  });
  it('announces save failure without marking a valid title invalid', async () => {
    const addButtonRef = createRef<HTMLButtonElement>();
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(
      <QuickAddDialog
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        addButtonRef={addButtonRef}
      />,
    );
    const field = screen.getByLabelText('Что нужно сделать?');
    fireEvent.change(field, { target: { value: 'Корректная задача' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось сохранить задачу',
    );
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
  });
  it('shows a stale-retry load error without reporting a save failure', async () => {
    const fake = renderApp();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fake.setStaleOnce();
    fake.setLoadFailure();
    fireEvent.click(screen.getByRole('button', { name: 'Задача' }));
    fireEvent.change(screen.getByLabelText('Что нужно сделать?'), {
      target: { value: 'Сохранить после конфликта' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    expect(await screen.findByText(/не удалось загрузить/i)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Сохранено');
    expect(screen.queryByText('Ошибка сохранения')).not.toBeInTheDocument();
  });

  it('creates through commands.apply using the current revision and default day/column', async () => {
    const app = renderApp();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Задача' }));
    const input = screen.getByLabelText('Что нужно сделать?');
    const submit = screen.getByRole('button', { name: 'Добавить задачу' });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Новая задача' } });
    fireEvent.click(submit);
    await screen.findByRole('heading', { name: 'Новая задача', level: 3 });
    expect(app.calls[0]?.expectedRevision).toBe(0);
    expect(app.calls[0]?.commands[0]).toMatchObject({
      kind: 'task.create',
      task: { title: 'Новая задача', columnId: 'todo', day: today() },
    });
  });
  it('opens task details from Today, Now, and Board and restores focus', async () => {
    renderApp([{ id: 'card-task', day: today() }]);
    await screen.findByRole('heading', { name: /Сегодня,/ });

    for (const view of ['Сегодня', 'Сейчас', 'Доска']) {
      if (view !== 'Сегодня') {
        fireEvent.click(screen.getByRole('button', { name: view }));
      }
      const trigger = await screen.findByRole('button', {
        name: /Открыть задачу:/,
      });
      fireEvent.click(trigger);
      const card = screen.getByLabelText(/^Карточка задачи:/);
      expect(card).toBeVisible();
      fireEvent.keyDown(card, { key: 'Escape' });
      await waitFor(() => expect(trigger).toHaveFocus());
    }
  });

  it('refreshes the task card and reports a stale revision without retrying', async () => {
    const app = renderApp([{ id: 'card-task', day: today() }]);
    await screen.findByRole('heading', { name: /Сегодня,/ });
    const open = screen.getByRole('button', { name: /Открыть задачу:/ });
    fireEvent.click(open);
    app.setStaleOnce();
    const title = screen.getByLabelText('Название');
    fireEvent.change(title, { target: { value: 'Новое название' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(
      await within(
        screen.getByLabelText('Карточка задачи: card-task'),
      ).findByRole('status'),
    ).toHaveTextContent(
      'Данные задачи изменились. Показана актуальная карточка; повторите изменение.',
    );
    expect(app.calls).toHaveLength(1);
    expect(app.snapshot().tasks[0]?.title).toBe('card-task');
    expect(title).toHaveValue('Новое название');
  });

  it('reloads once for stale revisions, then retains entered text on a retry failure', async () => {
    const stale = renderApp();
    stale.setStaleOnce();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Задача' }));
    fireEvent.change(screen.getByLabelText('Что нужно сделать?'), {
      target: { value: 'Повторить сохранение' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    await waitFor(() => {
      expect(stale.snapshot().tasks[0]?.title).toBe('Повторить сохранение');
    });
    expect(stale.calls).toHaveLength(2);
    expect(stale.calls[1]?.expectedRevision).toBe(1);

    cleanup();

    const retryFail = renderApp();
    retryFail.setStaleOnce();
    retryFail.setRejectRetry();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    fireEvent.click(screen.getByRole('button', { name: 'Задача' }));
    const field = screen.getByLabelText('Что нужно сделать?');
    fireEvent.change(field, { target: { value: 'Не терять текст' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    expect(
      await screen.findByText(/не удалось сохранить задачу/i),
    ).toBeVisible();
    expect(field).toHaveValue('Не терять текст');
    expect(retryFail.calls).toHaveLength(2);
  });

  it('opens quick input with Cmd+K, closes with Escape, and restores focus', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Сегодня пока пусто' });
    const add = screen.getByRole('button', { name: 'Задача' });
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Закрыть' }),
    ).toHaveAccessibleName();
    expect(screen.getByLabelText('Что нужно сделать?')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(add).toHaveFocus();
  });

  it('moves the selected task into the persisted doing column', async () => {
    const app = renderApp([{ id: 'move-me', day: today() }]);
    await screen.findByRole('heading', { name: 'move-me', level: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Взять в работу' }));
    await waitFor(() => {
      expect(app.snapshot().tasks[0]?.status.kind).toBe('doing');
    });
    expect(app.calls[0]?.commands[0]).toMatchObject({
      kind: 'task.move',
      id: 'move-me',
      columnId: 'doing',
    });
  });
});
