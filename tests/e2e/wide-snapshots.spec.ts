import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  TEST_NOW,
} from './smoke-fixtures';

const WIDTHS = [900, 1280, 1440, 1728] as const;
const WIDE = [1440, 1728] as const;
const SCREENS = [
  'Сегодня',
  'Сейчас',
  'Доска',
  'Все задачи',
  'Карточка',
  'Настройки',
] as const;
type Screen = (typeof SCREENS)[number];

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  const seeded = await page.evaluate(async () => {
    const result = await window.flowpilot.commands.apply({
      expectedRevision: 0,
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'wide-risk',
            title: 'Курсовая: собрать рабочий прототип',
            description: 'Собрать минимальный прототип каталога книг.',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: '2026-10-05',
            deadline: '2026-10-09',
            estimate: { unit: 'workdays', value: 5 },
            subtasks: [
              { id: 'w1', title: 'Выбрать структуру', completed: true },
              { id: 'w2', title: 'Собрать поиск', completed: false },
            ],
            comments: [{ id: 'wc1', text: 'Структура готова.' }],
            attachments: [],
            addedOrder: 1,
          },
        },
        {
          kind: 'task.create',
          task: {
            id: 'wide-plain',
            title: 'Разобрать конспекты за месяц',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: '2026-10-05',
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 2,
          },
        },
        {
          kind: 'task.create',
          task: {
            id: 'wide-later',
            title: 'Подготовиться к семинару',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: '2026-10-12',
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 3,
          },
        },
      ],
    });
    return result.ok;
  });
  expect(seeded).toBe(true);
  await page.reload();
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

async function resize(width: number): Promise<void> {
  await app?.evaluate(({ BrowserWindow }, size) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(size, 900);
  }, width);
  await page.setViewportSize({ width, height: 900 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
}

async function chooseTheme(theme: 'light' | 'dark'): Promise<void> {
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('combobox', { name: 'Тема' }).selectOption(theme);
}

async function show(screen: Screen): Promise<void> {
  if (screen === 'Настройки') {
    await page.getByRole('button', { name: 'Настройки' }).click();
    return;
  }
  const nav = page.getByRole('navigation', { name: 'Представления' });
  if (screen === 'Карточка') {
    await nav.getByRole('button', { name: 'Сегодня' }).click();
    await page
      .getByRole('button', { name: /^Открыть задачу/ })
      .first()
      .click();
    await expect(page.locator('.task-card')).toBeVisible();
    return;
  }
  await nav.getByRole('button', { name: screen }).click();
}

async function settle(): Promise<void> {
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
}

for (const width of WIDE) {
  for (const theme of ['light', 'dark'] as const) {
    for (const screen of SCREENS) {
      test(`matches ${theme} ${screen} at ${width.toString()}px`, async () => {
        await chooseTheme(theme);
        await resize(width);
        await show(screen);
        await settle();
        await expect(page).toHaveScreenshot(
          `wide-${theme}-${SCREENS.indexOf(screen).toString()}-${width.toString()}.png`,
        );
      });
    }
  }
}

for (const width of WIDTHS) {
  test(`has no horizontal scroll or clipped buttons on any screen at ${width.toString()}px`, async () => {
    await resize(width);
    for (const screen of SCREENS) {
      await show(screen);
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        clipped: [...document.querySelectorAll('button')]
          .filter(
            (button) =>
              button.getBoundingClientRect().right > window.innerWidth + 0.5,
          )
          .map((button) => button.textContent.trim()),
      }));
      expect(metrics.inner, screen).toBe(width);
      expect(metrics.scroll, screen).toBeLessThanOrEqual(width);
      expect(metrics.clipped, screen).toEqual([]);
    }
  });
}
