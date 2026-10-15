import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  SNAPSHOT_NOW_INSTANT,
  TEST_NOW,
  TODAY,
} from './smoke-fixtures';

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  const now = test.info().title.startsWith('matches ')
    ? SNAPSHOT_NOW_INSTANT
    : TEST_NOW;
  ({ app, page } = await launchSmokeApp(profilePath, now));
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('persists the selected frame theme and applies it before reopening', async () => {
  const themeButton = page.getByRole('button', { name: /Тема:/ });
  await themeButton.click();
  await expect
    .poll(async () => page.evaluate(() => window.flowpilot.settings.get()))
    .toMatchObject({ ok: true, value: { theme: 'light' } });
  await app?.close();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe(
    'light',
  );
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

  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  const firstFrameVisible = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isVisible(),
  );
  const firstFrameNativeTheme = await app.evaluate(
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
