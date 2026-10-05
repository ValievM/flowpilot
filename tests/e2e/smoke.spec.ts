import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const SNAPSHOT_WINDOW = {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
} as const;

let app: ElectronApplication | undefined;
// Playwright initializes the renderer page in beforeEach before each test body.
let page!: Page;
let profilePath: string;
test.beforeEach(async () => {
  profilePath = mkdtempSync(path.join(tmpdir(), 'flowpilot-e2e-'));
  app = await electron.launch({
    args: [
      path.resolve(__dirname, '../..'),
      `--force-device-scale-factor=${String(SNAPSHOT_WINDOW.deviceScaleFactor)}`,
      '--hide-scrollbars',
    ],
    env: {
      ...process.env,
      FLOWPILOT_TEST: '1',
      FLOWPILOT_TEST_NOW: '2026-10-05T12:00:00Z',
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
  await expect(
    page.getByRole('heading', { name: 'Сегодня, 5 октября', exact: true }),
  ).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
  rmSync(profilePath, { recursive: true, force: true });
});

test('opens the app without exposing Node globals', async () => {
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

test('loads an empty profile through the typed preload API', async () => {
  const result = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(result).toMatchObject({ ok: true, value: { tasks: [], revision: 0 } });
});

test('shows fixture tasks and keyboard accessible navigation', async () => {
  await expect(
    page.getByText('Курсовая: собрать рабочий прототип'),
  ).toBeVisible();
  await expect(page.getByText('Риск не успеть')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
  await expect(page.getByRole('heading', { name: 'Сейчас' })).toBeVisible();
});

test('has no horizontal overflow at 900 pixels', async () => {
  await page.setViewportSize({ width: 900, height: 800 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(900);
  await expect(
    page.getByRole('heading', { name: 'Собрать поиск и карточку книги' }),
  ).toBeVisible();
});

for (const width of [900, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`matches ${theme} Today snapshot at ${width.toString()}px`, async () => {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => {
        window.localStorage.clear();
      });
      await page.reload();
      expect(await page.evaluate(() => window.innerWidth)).toBe(width);
      const themeClicks = theme === 'light' ? 1 : 2;
      for (let click = 0; click < themeClicks; click += 1) {
        await page.getByRole('button', { name: /Тема:/ }).click();
      }
      // macOS renderers can disagree on an isolated edge pixel.
      await expect(page).toHaveScreenshot(
        `today-${theme}-${width.toString()}.png`,
        { fullPage: true, maxDiffPixelRatio: 0.00001 },
      );
    });
  }
}
