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

test('loads persisted board columns through the public renderer API', async () => {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Доска' })
    .click();
  await expect(page.getByRole('heading', { name: 'Доска' })).toBeVisible();
  for (const name of ['Сделать', 'Делаю', 'Ожидание', 'Готово']) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }
});

test('opens the board editor modally and restores focus after Escape', async () => {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Доска' })
    .click();
  const trigger = page.getByRole('button', { name: 'Добавить колонку' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Новая колонка' });
  const field = dialog.getByLabel('Название');
  await expect(dialog).toBeVisible();
  await expect(field).toBeFocused();
  await field.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('moves a persisted task with keyboard and pointer drops', async () => {
  const created = await page.evaluate(() =>
    window.flowpilot.commands.apply({
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'board-smoke-task',
            title: 'Проверить перенос',
            description: '',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: '2026-10-05',
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 0,
          },
        },
      ],
      expectedRevision: 0,
    }),
  );
  expect(created).toMatchObject({ ok: true, value: { revision: 1 } });
  await page.setViewportSize({ width: 900, height: 800 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(900);
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Доска' })
    .click();
  const card = page.getByRole('article', { name: 'Задача: Проверить перенос' });
  await expect(card).toBeVisible();
  for (const columnName of ['Сделать', 'Делаю', 'Ожидание', 'Готово']) {
    await expect(page.getByRole('region', { name: columnName })).toBeVisible();
  }
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('region', { name: 'Делаю' })).toHaveAttribute(
    'data-drop-active',
    'true',
  );
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('region', { name: 'Делаю' }).getByRole('article'),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  const titleBox = await card
    .getByRole('heading', { name: 'Проверить перенос' })
    .boundingBox();
  const doneBox = await page
    .getByRole('region', { name: 'Готово' })
    .boundingBox();
  if (!titleBox || !doneBox)
    throw new Error('Board drag targets are not visible');
  await page.mouse.move(
    titleBox.x + titleBox.width / 2,
    titleBox.y + titleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    doneBox.x + doneBox.width / 2,
    doneBox.y + doneBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole('region', { name: 'Готово' }).getByRole('article'),
  ).toBeVisible();
  const saved = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(saved).toMatchObject({
    ok: true,
    value: {
      tasks: [
        { id: 'board-smoke-task', columnId: 'done', status: { kind: 'done' } },
      ],
      revision: 3,
    },
  });
});

for (const width of [900, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`matches ${theme} Board snapshot at ${width.toString()}px`, async () => {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => {
        window.localStorage.clear();
      });
      await page.reload();
      const themeClicks = theme === 'light' ? 1 : 2;
      for (let click = 0; click < themeClicks; click += 1) {
        await page.getByRole('button', { name: /Тема:/ }).click();
      }
      await page
        .getByRole('navigation', { name: 'Представления' })
        .getByRole('button', { name: 'Доска' })
        .click();
      await expect(page.getByRole('heading', { name: 'Доска' })).toBeVisible();
      await expect(page).toHaveScreenshot(
        `board-${theme}-${width.toString()}.png`,
        { fullPage: true, maxDiffPixelRatio: 0.00001 },
      );
    });
  }
}
