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
const createAndOpenTask = async (title: string): Promise<void> => {
  await page.getByRole('button', { name: 'Все задачи' }).click();
  await page.getByRole('button', { name: 'Задача' }).click();
  await page.getByLabel('Что нужно сделать?').fill(title);
  await page.getByRole('button', { name: 'Добавить задачу' }).click();
  const opener = page.getByRole('button', { name: 'Открыть задачу' }).first();
  await opener.click();
};

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('edits a task, persists a comment, and returns keyboard focus', async () => {
  const windowState = await app?.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { visible: window?.isVisible(), focused: window?.isFocused() };
  });
  expect(windowState).toEqual({ visible: false, focused: false });
  await createAndOpenTask('Исходная задача');
  const opener = page.getByRole('button', { name: 'Открыть задачу' }).first();
  const card = page.locator('.task-card');
  await expect(card).toBeVisible();
  const title = page.getByLabel('Название');
  await title.fill('Обновлённая задача');
  await title.press('Enter');
  await expect(card.getByRole('status')).toContainText('Сохранено');

  const description = page.getByLabel('Описание');
  await description.fill('Согласовать первый вариант');
  await description.blur();
  await expect(card.getByRole('status')).toContainText('Сохранено');

  const deadline = page.getByLabel('Срок');
  await deadline.fill('2026-10-09');
  await expect(card.getByRole('status')).toContainText('Сохранено');

  const estimate = page.getByLabel('Остаток, рабочие дни');
  await estimate.fill('0');
  await estimate.press('Enter');
  await expect(card.getByRole('status')).toContainText(
    'Укажите целое число рабочих дней от 1.',
  );
  await estimate.fill('4');
  await estimate.press('Enter');
  await expect(card.getByRole('status')).toContainText('Сохранено');

  const newComment = page.getByRole('textbox', { name: 'Новый комментарий' });
  await newComment.fill('Обсудили следующий шаг');
  await card.getByRole('button', { name: 'Добавить' }).last().click();
  await expect(card.getByText('Обсудили следующий шаг')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(
    page.locator('.task-card').getByText('Обсудили следующий шаг'),
  ).toBeVisible();
});

for (const width of [900, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`matches ${theme} task card at ${width.toString()}px`, async () => {
      await page.setViewportSize({ width, height: 800 });
      await page.getByRole('button', { name: 'Настройки' }).click();
      await page.getByRole('combobox', { name: 'Тема' }).selectOption(theme);
      await page.getByRole('button', { name: 'Сегодня' }).click();
      await createAndOpenTask('Задача для снимка');
      await expect(page.locator('.task-card')).toBeVisible();
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
      await expect(page.locator('.task-card')).toHaveScreenshot(
        `task-card-${theme}-${width.toString()}.png`,
      );
    });
  }
}
