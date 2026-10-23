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

const REPLY = JSON.stringify({
  cards: [
    {
      title: 'Подготовить доклад',
      day: '2026-10-09',
      subtasks: [{ title: 'Собрать источники' }],
    },
  ],
  unknowns: [],
});

async function launch(): Promise<void> {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(
    profilePath,
    TEST_NOW,
    true,
    undefined,
    { FLOWPILOT_TEST_AI_REPLY: REPLY },
  ));
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Чат с AI' })
    .click();
}

async function openAllTasks(): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Все задачи' })
    .click();
}

async function ask(): Promise<void> {
  await page
    .getByLabel('Сообщение помощнику')
    .fill('Подготовить доклад к пятнице');
  await page.getByRole('button', { name: 'Отправить' }).click();
}

async function taskCount(): Promise<number> {
  return page.evaluate(async () => {
    const result = await window.flowpilot.snapshot.load();
    return result.ok ? result.value.tasks.length : -1;
  });
}

test.afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  removeSmokeProfile(profilePath);
});

test('confirm mode shows the diff, changes nothing until Apply, then keeps the card after Apply', async () => {
  await launch();
  await page.getByLabel('Режим AI').selectOption('confirm');
  await ask();
  await expect(page.getByText('Предложение AI')).toBeVisible();
  await expect(page.locator('.chat-diff')).toContainText('Подготовить доклад');
  await expect(page.locator('.chat-diff')).toContainText('09.10.2026');
  expect(await taskCount()).toBe(0);

  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByText('Изменения применены.')).toBeVisible();
  expect(await taskCount()).toBe(1);
  await openAllTasks();
  await expect(page.getByText('Подготовить доклад').first()).toBeVisible();
});

test('declining a proposal leaves the data untouched and the next request reports an unavailable AI', async () => {
  await launch();
  await page.getByLabel('Режим AI').selectOption('confirm');
  await ask();
  await page.getByRole('button', { name: 'Отклонить' }).click();
  await expect(page.getByText(/Предложение отклонено/)).toBeVisible();
  expect(await taskCount()).toBe(0);

  await ask();
  await expect(page.getByRole('alert')).toContainText('AI сейчас недоступен');
  expect(await taskCount()).toBe(0);
});

test('auto mode applies at once and the change can be undone from the chat', async () => {
  await launch();
  await page.getByLabel('Режим AI').selectOption('auto');
  await ask();
  await expect(page.getByText('Изменения применены.')).toBeVisible();
  expect(await taskCount()).toBe(1);

  await page.getByRole('button', { name: 'Отменить изменения' }).click();
  await expect(page.getByText('Изменения отменены.')).toBeVisible();
  expect(await taskCount()).toBe(0);
});

test('the AI mode survives a restart', async () => {
  await launch();
  await page.getByLabel('Режим AI').selectOption('confirm');
  await expect
    .poll(() => page.getByLabel('Режим AI').inputValue())
    .toBe('confirm');
  const profile = profilePath;
  await app?.close();
  ({ app, page } = await launchSmokeApp(profile, TEST_NOW));
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Чат с AI' })
    .click();
  await expect(page.getByLabel('Режим AI')).toHaveValue('confirm');
});

for (const theme of ['light', 'dark'] as const) {
  test(`chat proposal looks right in the ${theme} theme`, async () => {
    await launch();
    await page.emulateMedia({ colorScheme: theme });
    await page.getByLabel('Режим AI').selectOption('confirm');
    await ask();
    await expect(page.getByText('Предложение AI')).toBeVisible();
    await expect(page).toHaveScreenshot(`chat-proposal-${theme}.png`);
  });
}
