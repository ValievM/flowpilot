import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  SNAPSHOT_NOW_INSTANT,
  TEST_NOW,
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

test('removes the titlebar inset while fullscreen state is active', async () => {
  const windowBefore = await app?.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { visible: window?.isVisible(), focused: window?.isFocused() };
  });
  expect(windowBefore).toEqual({ visible: false, focused: false });
  const dragRegion = page.locator('.sidebar-titlebar-drag');
  const initialHeight = await dragRegion.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).height),
  );
  expect(initialHeight).toBeGreaterThan(0);
  await page.evaluate(() => {
    document.documentElement.toggleAttribute('data-full-screen', true);
  });
  const fullscreenInsets = await dragRegion.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: style.height,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
    };
  });
  expect(fullscreenInsets).toEqual({
    height: '0px',
    marginTop: '0px',
    marginBottom: '0px',
  });
  const windowAfter = await app?.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { visible: window?.isVisible(), focused: window?.isFocused() };
  });
  expect(windowAfter).toEqual({ visible: false, focused: false });
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-full-screen');
  });
  await expect
    .poll(() =>
      dragRegion.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).height),
      ),
    )
    .toBe(initialHeight);
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
test('keeps the Today screen usable at 200% zoom at supported widths', async () => {
  for (const width of [900, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await app?.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2);
    });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => window.innerWidth)).toBeLessThan(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    await app?.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
    });
  }
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
