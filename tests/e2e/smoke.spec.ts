import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'node:path';

let app: ElectronApplication | undefined;
let page: Page;

test.beforeEach(async () => {
  app = await electron.launch({ args: [path.resolve(__dirname, '../..')] });
  page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'FlowPilot' })).toBeVisible();
});

test.afterEach(async () => {
  if (app) await app.close();
});

test('opens the app without exposing Node globals', async () => {
  await expect(page.getByText('Ваш день начинается с ясного плана.')).toBeVisible();
  expect(await page.evaluate(() => typeof (window as Window & { require?: unknown }).require)).toBe('undefined');
  expect(await page.evaluate(() => typeof (window as Window & { process?: unknown }).process)).toBe('undefined');
});

for (const theme of ['light', 'dark'] as const) {
  test(`matches the ${theme} theme snapshot`, async () => {
    await page.evaluate((selectedTheme) => {
      document.documentElement.dataset.theme = selectedTheme;
    }, theme);
    await expect(page).toHaveScreenshot(`welcome-${theme}.png`, { fullPage: true });
  });
}
