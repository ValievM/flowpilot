import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { Temporal } from 'temporal-polyfill';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const DEFAULT_TEST_NOW = '2026-10-05T12:00:00Z';
const SNAPSHOT_NOW = '2026-10-05T12:00:00Z';
const TEST_NOW = process.env.FLOWPILOT_TEST_NOW ?? DEFAULT_TEST_NOW;
function localDateAt(instant: string): Temporal.PlainDate {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
}

function todayLabelAt(instant: string): string {
  const date = localDateAt(instant);
  return `Сегодня, ${date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })}`;
}

const TODAY_DATE = localDateAt(TEST_NOW);
const TODAY = TODAY_DATE.toString();
const SNAPSHOT_DATE = localDateAt(SNAPSHOT_NOW);
const SNAPSHOT_DAY = SNAPSHOT_DATE.toString();
const SNAPSHOT_DEADLINE = SNAPSHOT_DATE.add({ days: 4 }).toString();
const SNAPSHOT_WINDOW = {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
} as const;

let app: ElectronApplication | undefined;
// Playwright initializes the renderer page in beforeEach before each test body.
let page!: Page;
let profilePath: string;
async function startApp(now: string, verifyDate = true): Promise<void> {
  app = await electron.launch({
    args: [
      path.resolve(__dirname, '../..'),
      `--force-device-scale-factor=${String(SNAPSHOT_WINDOW.deviceScaleFactor)}`,
      '--hide-scrollbars',
    ],
    env: {
      ...process.env,
      FLOWPILOT_TEST: '1',
      FLOWPILOT_TEST_NOW: now,
      FLOWPILOT_TEST_PROFILE: profilePath,
    },
  });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, SNAPSHOT_WINDOW);
  await page.setViewportSize({
    width: SNAPSHOT_WINDOW.width,
    height: SNAPSHOT_WINDOW.height,
  });
  if (verifyDate) {
    await expect(
      page.getByRole('heading', { name: todayLabelAt(now), exact: true }),
    ).toBeVisible();
  }
}
test.beforeEach(async () => {
  const { title } = test.info();
  profilePath = mkdtempSync(path.join(tmpdir(), 'flowpilot-e2e-'));
  const fixtureNow = title.startsWith('matches ') ? SNAPSHOT_NOW : TEST_NOW;
  await startApp(
    fixtureNow,
    title !==
      'uses shifted main time for the Today header and Сейчас availability',
  );
});

test.afterEach(async () => {
  if (app) await app.close();
  rmSync(profilePath, { recursive: true, force: true });
});

test('keeps the E2E window hidden without exposing Node globals', async () => {
  const windowState = await app?.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { visible: window?.isVisible(), focused: window?.isFocused() };
  });
  expect(windowState).toEqual({ visible: false, focused: false });
  await expect(page.getByText('Сохранено')).toBeVisible();
  expect(
    await page.evaluate(
      () => typeof (window as Window & { require?: unknown }).require,
    ),
  ).toBe('undefined');
  expect(
    await page.evaluate(
      () => typeof (window as Window & { process?: unknown }).process,
    ),
  ).toBe('undefined');
});

test('uses shifted main time for the Today header and Сейчас availability', async () => {
  const shiftedNow = Temporal.Instant.from(TEST_NOW)
    .add({ hours: 720 })
    .toString();
  const shiftedDate = localDateAt(shiftedNow).toString();
  await app?.close();
  app = undefined;
  rmSync(profilePath, { recursive: true, force: true });
  profilePath = mkdtempSync(path.join(tmpdir(), 'flowpilot-e2e-shifted-'));
  await startApp(shiftedNow);
  const result = await page.evaluate(
    async (day) =>
      window.flowpilot.commands.apply({
        expectedRevision: 0,
        commands: [
          {
            kind: 'task.create',
            task: {
              id: 'shifted-today',
              title: 'Дело в смещённом Сегодня',
              description: '',
              status: { kind: 'todo' },
              columnId: 'todo',
              day,
              subtasks: [],
              comments: [],
              attachments: [],
              addedOrder: 0,
            },
          },
        ],
      }),
    shiftedDate,
  );
  expect(result).toMatchObject({ ok: true });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Дело в смещённом Сегодня', level: 3 }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Дело в смещённом Сегодня' }),
  ).toBeVisible();
});

test('loads an empty profile and shows the empty state in Сейчас', async () => {
  const result = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(result).toMatchObject({ ok: true, value: { tasks: [], revision: 0 } });
  await page.getByRole('button', { name: 'Сейчас' }).click();
  await expect(
    page.getByRole('heading', { name: 'Сегодня пока пусто' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Добавьте задачу — она сохранится и появится в сегодняшнем списке.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/ожидают ответа, завершены или назначены на будущее/i),
  ).toHaveCount(0);
});

test('rejects renderer attachment additions through the public IPC API', async () => {
  const result = await page.evaluate(async (today) => {
    const created = await window.flowpilot.commands.apply({
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'task-ipc',
            title: 'Plan',
            description: '',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: today,
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 0,
          },
        },
      ],
      expectedRevision: 0,
    });
    if (!created.ok) return { created, attempt: null, snapshot: null };
    // The untyped payload simulates a compromised renderer bypassing TypeScript.
    const attempt = await window.flowpilot.commands.apply({
      commands: [
        {
          kind: 'attachment.add',
          taskId: 'task-ipc',
          attachment: {
            id: 'attachment-ipc',
            name: 'notes.txt',
            mediaType: 'text/plain',
            sizeBytes: 12,
          },
        },
      ],
      expectedRevision: 1,
    } as unknown as Parameters<typeof window.flowpilot.commands.apply>[0]);
    return {
      created,
      attempt,
      snapshot: await window.flowpilot.snapshot.load(),
    };
  }, TODAY);
  expect(result.created).toMatchObject({ ok: true, value: { revision: 1 } });
  expect(result.attempt).toEqual({ ok: false, error: 'ValidationFailed' });
  expect(result.snapshot).toMatchObject({
    ok: true,
    value: {
      revision: 1,
      tasks: [{ id: 'task-ipc', attachments: [] }],
    },
  });
});

test('shows a saved task and keyboard accessible navigation', async () => {
  await page.getByRole('button', { name: 'Задача' }).click();
  await page
    .getByLabel('Что нужно сделать?')
    .fill('Задача из сохранённого снимка');
  await page.getByLabel('Что нужно сделать?').press('Enter');
  await expect(
    page.getByRole('heading', {
      name: 'Задача из сохранённого снимка',
      level: 3,
    }),
  ).toBeVisible();
  const snapshot = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(snapshot).toMatchObject({
    ok: true,
    value: {
      revision: 1,
      tasks: [{ title: 'Задача из сохранённого снимка' }],
    },
  });
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Задача из сохранённого снимка' }),
  ).toBeVisible();
});

test('shows neutral unknown and danger risk colors on Board and All in Electron', async () => {
  const created = await page.evaluate(
    ({ day, deadline }) =>
      window.flowpilot.commands.apply({
        expectedRevision: 0,
        commands: [
          {
            kind: 'task.create',
            task: {
              id: 'unknown-risk',
              title: 'Объём неизвестен',
              description: '',
              status: { kind: 'todo' },
              columnId: 'todo',
              day,
              deadline,
              subtasks: [],
              comments: [],
              attachments: [],
              addedOrder: 0,
            },
          },
          {
            kind: 'task.create',
            task: {
              id: 'tight-risk',
              title: 'Запас исчерпан',
              description: '',
              status: { kind: 'todo' },
              columnId: 'todo',
              day,
              deadline,
              estimate: { unit: 'workdays', value: 5 },
              subtasks: [],
              comments: [],
              attachments: [],
              addedOrder: 1,
            },
          },
        ],
      }),
    { day: TODAY, deadline: '2026-10-09' },
  );
  expect(created).toMatchObject({ ok: true });
  await page.reload();

  for (const view of ['Доска', 'Все задачи']) {
    await page
      .getByRole('navigation', { name: 'Представления' })
      .getByRole('button', { name: view })
      .click();
    const unknown = page.locator('[data-risk-kind="unknown"]');
    const tight = page.locator('[data-risk-kind="tight"]');
    await expect(unknown).toBeVisible();
    await expect(unknown).toHaveClass(/risk-unknown/);
    await expect(tight).toBeVisible();
    await expect(tight).toHaveClass(/is-risk/);
    await expect(tight).toHaveAttribute('title', 'Риск не успеть');
    const colors = {
      unknown: await unknown.evaluate(
        (element) => getComputedStyle(element).color,
      ),
      tight: await tight.evaluate((element) => getComputedStyle(element).color),
      expected: await page.evaluate(() => {
        const measure = (token: string): string => {
          const probe = document.createElement('span');
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        return { neutral: measure('--muted'), danger: measure('--danger') };
      }),
    };
    expect(colors.unknown).toBe(colors.expected.neutral);
    expect(colors.tight).toBe(colors.expected.danger);
  }
});

test('has no horizontal overflow at 900 pixels with a long task title', async () => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.getByRole('button', { name: 'Задача' }).click();
  await page
    .getByLabel('Что нужно сделать?')
    .fill('Задача с названием, которое должно переноситься на несколько строк');
  await page.getByRole('button', { name: 'Добавить задачу' }).click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(900);
  await expect(
    page.getByRole('heading', {
      name: 'Задача с названием, которое должно переноситься на несколько строк',
      level: 3,
    }),
  ).toBeVisible();
});

test('keeps the titlebar drag region away from actions at the minimum width', async () => {
  await page.setViewportSize({ width: 900, height: 800 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(900);
  await expect(
    page.getByText('Моё пространство', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Представления' })
      .getByRole('button', {
        name: 'Сегодня',
      }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Задача' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Что нужно сделать?')).toBeFocused();
  expect(
    await page
      .getByRole('button', { name: 'Задача' })
      .evaluate((button) =>
        getComputedStyle(button).getPropertyValue('-webkit-app-region'),
      ),
  ).toBe('no-drag');
});

test('persists the selected frame theme and applies it before reopening', async () => {
  const themeButton = page.getByRole('button', { name: /Тема:/ });
  await themeButton.click();
  await expect
    .poll(async () => page.evaluate(() => window.flowpilot.settings.get()))
    .toMatchObject({ ok: true, value: { theme: 'light' } });
  await app?.close();
  await startApp(TEST_NOW);
  expect(
    await app?.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
  ).toBe('light');
});

test('migrates a legacy renderer theme before the first visible frame', async () => {
  const initialProfile = await page.evaluate(async () => ({
    settings: await window.flowpilot.settings.get(),
    snapshot: await window.flowpilot.snapshot.load(),
  }));
  expect(initialProfile.settings).toMatchObject({ ok: true });
  if (initialProfile.settings.ok) {
    expect(Object.hasOwn(initialProfile.settings.value, 'theme')).toBe(false);
  }
  expect(initialProfile.snapshot).toMatchObject({
    ok: true,
    value: { revision: 0 },
  });
  await page.evaluate(() => {
    window.localStorage.setItem('flowpilot-theme', 'light');
  });
  await app?.close();

  await startApp(TEST_NOW);
  const firstFrameVisible = await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isVisible(),
  );
  const firstFrameNativeTheme = await app?.evaluate(
    ({ nativeTheme }) => nativeTheme.themeSource,
  );
  const firstFrameRendererTheme = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  expect({
    visible: firstFrameVisible,
    nativeTheme: firstFrameNativeTheme,
    rendererTheme: firstFrameRendererTheme,
  }).toEqual({
    visible: process.env.FLOWPILOT_E2E !== '1',
    nativeTheme: 'light',
    rendererTheme: 'light',
  });
  const migratedProfile = await page.evaluate(async () => ({
    settings: await window.flowpilot.settings.get(),
    snapshot: await window.flowpilot.snapshot.load(),
    legacyTheme: window.localStorage.getItem('flowpilot-theme'),
  }));
  expect(migratedProfile).toMatchObject({
    settings: { ok: true, value: { theme: 'light' } },
    snapshot: { ok: true, value: { revision: 1 } },
    legacyTheme: null,
  });
});

test('rejects generic theme writes without changing the live appearance', async () => {
  const nativeThemeBefore = await app?.evaluate(
    ({ nativeTheme }) => nativeTheme.themeSource,
  );
  const rendererThemeBefore = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  const windowVisible = await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isVisible(),
  );
  expect(windowVisible).toBe(process.env.FLOWPILOT_E2E !== '1');
  const settingsBefore = await page.evaluate(() =>
    window.flowpilot.settings.get(),
  );
  const attempts = await page.evaluate(async () => {
    const setting = await window.flowpilot.settings.set({
      key: 'theme',
      value: 'light',
      expectedRevision: 0,
    });
    const snapshot = await window.flowpilot.snapshot.load();
    if (!snapshot.ok) {
      throw new Error('Could not read the current repository revision');
    }
    const command = await window.flowpilot.commands.apply({
      commands: [{ kind: 'setting.set', key: 'theme', value: 'dark' }],
      expectedRevision: snapshot.value.revision,
    });
    return { setting, command };
  });
  expect(attempts).toEqual({
    setting: { ok: false, error: 'ValidationFailed' },
    command: { ok: false, error: 'ValidationFailed' },
  });
  expect(
    await app?.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
  ).toBe(nativeThemeBefore);
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe(rendererThemeBefore);
  const unchangedProfile = await page.evaluate(async () => ({
    settings: await window.flowpilot.settings.get(),
    snapshot: await window.flowpilot.snapshot.load(),
  }));
  expect(unchangedProfile.settings).toEqual(settingsBefore);
  expect(unchangedProfile.snapshot).toMatchObject({
    ok: true,
    value: { revision: 0 },
  });
});

test('removes the titlebar inset in native full screen', async () => {
  await app?.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setFullScreen(true);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.hasAttribute('data-full-screen'),
      ),
    )
    .toBe(true);
  await app?.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setFullScreen(false);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.hasAttribute('data-full-screen'),
      ),
    )
    .toBe(false);
});
test('keeps the navigation titlebar clear across supported widths', async () => {
  for (const width of [900, 1280, 1440, 1728]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const bounds = await page.getByLabel('Хлебные крошки').boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(104);
    await expect(
      page.getByText('Моё пространство', { exact: true }),
    ).toBeVisible();
  }
});
test('creates and starts a task through persisted Today and Now flows', async () => {
  await page.getByRole('button', { name: 'Задача' }).click();
  await page.getByLabel('Что нужно сделать?').fill('Проверить быстрый ввод');
  await page.getByRole('button', { name: 'Добавить задачу' }).click();
  await expect(
    page.getByRole('heading', { name: 'Проверить быстрый ввод', level: 3 }),
  ).toBeVisible();
  await expect(page.getByText('Сохранено')).toBeVisible();

  const created = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(created).toMatchObject({
    ok: true,
    value: {
      revision: 1,
      tasks: [
        {
          title: 'Проверить быстрый ввод',
          status: { kind: 'todo' },
          day: TODAY,
        },
      ],
    },
  });
  await page.getByRole('button', { name: 'Взять в работу' }).click();
  const started = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(started).toMatchObject({
    ok: true,
    value: {
      revision: 2,
      tasks: [{ title: 'Проверить быстрый ввод', status: { kind: 'doing' } }],
    },
  });
});

test('persists settings and applies reduced motion to control transitions', async () => {
  await page.getByRole('button', { name: 'Настройки' }).click();
  const theme = page.getByRole('combobox', { name: 'Тема' });
  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await window.flowpilot.snapshot.load();
        return result.ok ? result.value.settings.theme : undefined;
      }),
    )
    .toBe('dark');
  const friday = page.getByRole('checkbox', { name: 'Пятница' });
  await friday.click();
  await expect(friday).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await window.flowpilot.snapshot.load();
        return result.ok ? result.value.settings.workdays : undefined;
      }),
    )
    .toEqual([1, 2, 3, 4]);
  const motion = page.getByRole('combobox', { name: 'Уменьшить движение' });
  await motion.selectOption('reduce');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion');
  await expect
    .poll(() =>
      page
        .getByRole('button', { name: 'Задача' })
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toBe('0s');
  await motion.selectOption('full');
  await expect(page.locator('html')).not.toHaveAttribute('data-reduce-motion');
  await expect
    .poll(() =>
      page
        .getByRole('button', { name: 'Задача' })
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toBe('0.14s, 0.14s');
  await motion.selectOption('reduce');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Настройки' })).toBeVisible();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Пятница' }),
  ).not.toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Тема' })).toHaveValue(
    'dark',
  );
  await expect(motion).toHaveValue('reduce');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion');
});

for (const width of [760, 600]) {
  test(`keeps the workspace visible below the sidebar at ${width.toString()}px`, async () => {
    await page.setViewportSize({ width, height: 800 });
    const sidebar = await page.locator('.sidebar').boundingBox();
    const workspace = await page.locator('.workspace').boundingBox();
    if (!sidebar || !workspace)
      throw new Error('Боковая панель или рабочая область не отображается.');
    await expect(page.locator('.sidebar')).toHaveCSS('flex-direction', 'row');
    expect(sidebar.height).toBeLessThan(800);
    expect(workspace.y).toBeLessThan(800);
  });
}

for (const width of [900, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`matches ${theme} settings snapshot at ${width.toString()}px`, async () => {
      await page.setViewportSize({ width, height: 800 });
      await page.getByRole('button', { name: 'Настройки' }).click();
      await page.getByRole('combobox', { name: 'Тема' }).selectOption(theme);
      expect(await page.evaluate(() => window.innerWidth)).toBe(width);
      await page.evaluate(() => {
        window.getSelection()?.removeAllRanges();
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const themeChoice = page.getByRole('combobox', { name: 'Тема' });
      await themeChoice.focus();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('combobox', { name: 'Уменьшить движение' }),
      ).toBeFocused();
      await expect
        .poll(() =>
          page
            .getByRole('combobox', { name: 'Уменьшить движение' })
            .evaluate((element) => getComputedStyle(element).outlineStyle),
        )
        .toBe('solid');
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      await expect
        .poll(() =>
          page.getByRole('combobox', { name: 'Тема' }).evaluate((element) => {
            const styles = getComputedStyle(element);
            return {
              height: styles.height,
              borderColor: styles.borderColor,
              appearance: styles.appearance,
              backgroundImage: styles.backgroundImage,
            };
          }),
        )
        .toMatchObject({
          height: '36px',
          appearance: 'none',
        });
      expect(
        await page
          .getByRole('checkbox', { name: 'Понедельник' })
          .evaluate((element) => {
            const reference = document.createElement('input');
            reference.type = 'checkbox';
            reference.style.accentColor = 'var(--accent)';
            document.body.append(reference);
            const matchesToken =
              getComputedStyle(element).accentColor ===
              getComputedStyle(reference).accentColor;
            reference.remove();
            return matchesToken;
          }),
      ).toBe(true);
      const fieldset = page.getByRole('group', {
        name: 'Дни недели, учитываемые при расчёте срока',
      });
      const card = page
        .getByRole('heading', { name: 'Рабочие дни' })
        .locator('..');
      const fieldsetBounds = await fieldset.boundingBox();
      const cardBounds = await card.boundingBox();
      if (!fieldsetBounds || !cardBounds)
        throw new Error('Настройка рабочих дней не отображается.');
      expect(fieldsetBounds.x).toBeGreaterThan(cardBounds.x);
      expect(fieldsetBounds.x + fieldsetBounds.width).toBeLessThan(
        cardBounds.x + cardBounds.width,
      );
      const sidebar = await page.locator('.sidebar').boundingBox();
      const content = await page.locator('.workspace').boundingBox();
      if (!sidebar || !content)
        throw new Error('Боковая панель или содержимое не отображается.');
      expect(sidebar.height).toBeGreaterThanOrEqual(content.height);
      await expect(page).toHaveScreenshot(
        `settings-${theme}-${width.toString()}.png`,
        { fullPage: true, maxDiffPixelRatio: 0.00001 },
      );
    });
  }
}

for (const screen of ['today', 'now'] as const) {
  for (const width of [900, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`matches ${theme} ${screen} snapshot at ${width.toString()}px`, async () => {
        expect(
          await page.evaluate(
            () => Intl.DateTimeFormat().resolvedOptions().timeZone,
          ),
        ).toBe('UTC');
        await page.setViewportSize({ width, height: 800 });
        const seeded = await page.evaluate(
          ({ today, deadline }) =>
            window.flowpilot.commands.apply({
              commands: [
                {
                  kind: 'task.create',
                  task: {
                    id: 'snapshot-risk',
                    title: 'Задача с риском срока',
                    description: '',
                    status: { kind: 'todo' },
                    columnId: 'todo',
                    day: today,
                    deadline,
                    estimate: { unit: 'workdays', value: 5 },
                    subtasks: [],
                    comments: [],
                    attachments: [],
                    addedOrder: 0,
                  },
                },
              ],
              expectedRevision: 0,
            }),
          { today: SNAPSHOT_DAY, deadline: SNAPSHOT_DEADLINE },
        );
        expect(seeded).toMatchObject({ ok: true, value: { revision: 1 } });
        await page.evaluate(() => {
          window.localStorage.clear();
        });
        await page.reload();
        expect(await page.evaluate(() => window.innerWidth)).toBe(width);
        const themeClicks = theme === 'light' ? 1 : 2;
        for (let click = 0; click < themeClicks; click += 1) {
          await page.getByRole('button', { name: /Тема:/ }).click();
        }
        if (screen === 'now') {
          await page
            .getByRole('navigation', { name: 'Представления' })
            .getByRole('button', { name: 'Сейчас' })
            .click();
        }
        // macOS renderers can disagree on an isolated edge pixel.
        await expect(page).toHaveScreenshot(
          `${screen}-${theme}-${width.toString()}.png`,
          { fullPage: true, maxDiffPixelRatio: 0.00001 },
        );
      });
    }
  }
}

