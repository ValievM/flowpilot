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

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

async function tabUntilFocused(name: string, limit = 60): Promise<void> {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLInputElement | null;
      const labels = Array.from(element?.labels ?? []).map((label) =>
        label.textContent.trim(),
      );
      return (
        element?.getAttribute('aria-label') ??
        labels.at(0) ??
        element?.textContent.trim() ??
        ''
      );
    });
    if (focused === name) return;
  }
  throw new Error(
    `Focus never reached "${name}" within ${limit.toString()} Tab presses.`,
  );
}

test('creates a task and opens, edits and closes its card using only the keyboard', async () => {
  await page.keyboard.press('ControlOrMeta+K');
  const title = page.getByLabel('Что нужно сделать?');
  await expect(title).toBeFocused();
  await page.keyboard.type('Клавиатурная задача');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Клавиатурная задача', level: 3 }),
  ).toBeVisible();

  await tabUntilFocused('Открыть задачу: Клавиатурная задача');
  const opener = page.getByRole('button', {
    name: 'Открыть задачу: Клавиатурная задача',
  });
  await expect(opener).toBeFocused();
  await page.keyboard.press('Enter');

  const closeButton = page.getByRole('button', {
    name: 'Закрыть карточку задачи',
  });
  await expect(closeButton).toBeVisible();
  await tabUntilFocused('Описание');
  await page.keyboard.type('Описание с клавиатуры');
  await page.keyboard.press('Tab');
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const result = await window.flowpilot.snapshot.load();
        return result.ok ? result.value.tasks[0]?.description : undefined;
      }),
    )
    .toBe('Описание с клавиатуры');

  await page.keyboard.press('Escape');
  await expect(closeButton).toBeHidden();
  await expect(opener).toBeFocused();
});
