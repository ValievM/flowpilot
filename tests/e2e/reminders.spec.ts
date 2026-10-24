import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  TEST_NOW,
} from './smoke-fixtures';

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

async function shown(): Promise<number> {
  return (
    (await app?.evaluate(
      () =>
        (globalThis as { __FLOWPILOT_TEST_NOTIFICATIONS__?: unknown[] })
          .__FLOWPILOT_TEST_NOTIFICATIONS__?.length ?? -1,
    )) ?? -1
  );
}

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  await page.getByRole('button', { name: 'Настройки' }).click();
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('AC-11: opening the settings asks for nothing; the permission is requested only by "Настроить"', async () => {
  await expect(page.getByText(/ещё не запрашивалось/)).toBeVisible();
  expect(await shown()).toBe(0);
  await page.getByRole('button', { name: 'Настроить' }).click();
  await expect(page.getByText('Уведомления разрешены.')).toBeVisible();
  expect(await shown()).toBe(1);
});

test('AC-11: the switch and the lead time survive a restart', async () => {
  await page
    .getByRole('checkbox', {
      name: 'Напоминать о занятиях и делах со временем',
    })
    .check();
  await page.getByLabel('За сколько минут напомнить').selectOption('30');
  await expect(page.getByLabel('За сколько минут напомнить')).toHaveValue('30');
  await app?.close();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(
    page.getByRole('checkbox', {
      name: 'Напоминать о занятиях и делах со временем',
    }),
  ).toBeChecked();
  await expect(page.getByLabel('За сколько минут напомнить')).toHaveValue('30');
});

for (const theme of ['light', 'dark'] as const) {
  test(`reminders block looks right in the ${theme} theme`, async () => {
    await page.emulateMedia({ colorScheme: theme });
    await page
      .getByRole('heading', { name: 'Напоминания' })
      .scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot(`reminders-${theme}.png`);
  });
}
