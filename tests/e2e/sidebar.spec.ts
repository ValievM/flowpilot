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
  const seeded = await page.evaluate(async () => {
    const result = await window.flowpilot.commands.apply({
      expectedRevision: 0,
      commands: Array.from({ length: 25 }, (_, index) => ({
        kind: 'task.create' as const,
        task: {
          id: `sidebar-${index.toString()}`,
          title: `Задача номер ${(index + 1).toString()}`,
          status: { kind: 'todo' as const },
          columnId: 'todo',
          day: '2026-10-05',
          subtasks: [],
          comments: [],
          attachments: [],
          addedOrder: index + 1,
        },
      })),
    });
    return result.ok;
  });
  expect(seeded).toBe(true);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.reload();
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('the sidebar stays in place while the page scrolls', async () => {
  const sidebar = page.getByRole('complementary', { name: 'Основная панель' });
  await expect(sidebar).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const box = await sidebar.boundingBox();
  expect(box?.y).toBe(0);
  expect(box?.height).toBe(600);
  await expect(page.getByRole('button', { name: /^Тема:/ })).toBeInViewport();
});

test('the sidebar hides and returns smoothly and leaves the tab order while hidden', async () => {
  const sidebar = page.locator('.sidebar');
  const workspace = page.locator('.workspace');
  const left = async (): Promise<number> =>
    (await workspace.boundingBox())?.x ?? -1;
  expect(await left()).toBeGreaterThan(90);

  const duration = await page
    .locator('.app-shell')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration).not.toBe('0s');

  await page.getByRole('button', { name: 'Скрыть боковую панель' }).click();
  await expect.poll(left).toBeLessThanOrEqual(1);
  await expect(sidebar).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab');
  const focusInSidebar = await page.evaluate(
    () => document.activeElement?.closest('.sidebar') !== null,
  );
  expect(focusInSidebar).toBe(false);

  await page.getByRole('button', { name: 'Показать боковую панель' }).click();
  await expect.poll(left).toBeGreaterThan(90);
  await expect(sidebar).not.toHaveAttribute('inert');
  await expect(
    page.getByRole('button', { name: 'Скрыть боковую панель' }),
  ).toHaveAttribute('aria-expanded', 'true');
});

test('the top bar with status, undo, history and add stays visible while the page scrolls', async () => {
  const topbar = page.locator('.topbar');
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const box = await topbar.boundingBox();
  expect(box?.y).toBe(0);
  await expect(
    page.getByRole('button', { name: 'Задача', exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'История', exact: true }),
  ).toBeInViewport();
});
