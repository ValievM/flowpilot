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
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'now-main',
            title: 'Курсовая: собрать рабочий прототип',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: '2026-10-05',
            deadline: '2026-10-09',
            estimate: { unit: 'workdays', value: 5 },
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 1,
          },
        },
        {
          kind: 'series.create',
          series: {
            id: 'now-reading',
            title: 'Чтение 20 минут',
            weekdays: [1, 2, 3, 4, 5],
            startsOn: '2026-10-05',
          },
        },
        {
          kind: 'series.create',
          series: {
            id: 'now-warmup',
            title: 'Зарядка',
            weekdays: [1, 3, 5],
            time: '09:00',
            startsOn: '2026-10-05',
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

async function showNow(width: number, height = 800): Promise<void> {
  await app?.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
    },
    { width, height },
  );
  await page.setViewportSize({ width, height });
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
}

const box = async (locator: ReturnType<Page['locator']>) => {
  const result = await locator.boundingBox();
  if (!result) throw new Error('Element is not visible.');
  return result;
};

test('Now is one calm column that does not stretch on a wide window', async () => {
  await showNow(1728);
  const card = await box(page.locator('.now-screen .next-step'));
  const repeats = await box(page.locator('.repeat-panel'));
  expect(card.width).toBeGreaterThanOrEqual(700);
  expect(card.width).toBeLessThanOrEqual(800);
  expect(repeats.x).toBeCloseTo(card.x, 0);
  expect(repeats.width).toBeCloseTo(card.width, 0);
});

test('the task name outweighs the screen title and the button hugs its text', async () => {
  await showNow(1280);
  const sizes = await page.evaluate(() => ({
    screen: parseFloat(
      getComputedStyle(document.querySelector('h1') as Element).fontSize,
    ),
    task: parseFloat(
      getComputedStyle(document.querySelector('.now-screen h2') as Element)
        .fontSize,
    ),
  }));
  expect(sizes.task).toBeGreaterThan(sizes.screen);
  const title = await box(page.locator('.now-screen h2 button'));
  const start = await box(page.getByRole('button', { name: 'Взять в работу' }));
  const card = await box(page.locator('.now-screen .next-step'));
  expect(start.x).toBeCloseTo(title.x, 0);
  expect(start.width).toBeLessThan(card.width / 2);
});

test('the selection rule and the risk calculation wait behind a disclosure', async () => {
  await showNow(1280);
  await expect(page.getByText(/ближайшему сроку/)).toBeHidden();
  await expect(page.getByText('Риск не успеть')).toBeVisible();
  await page.getByText('Почему эта задача').click();
  await expect(page.getByText(/ближайшему сроку/)).toBeVisible();
  await expect(page.getByText(/запас исчерпан/)).toBeVisible();
});

test('the main task and its button are in view without scrolling at 900 px', async () => {
  await showNow(900);
  await expect(
    page.getByRole('button', { name: 'Взять в работу' }),
  ).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Выполнено' }).first(),
  ).toBeInViewport();
});

test('a repeat keeps title and time on the left and actions on the right, and stacks them when narrow', async () => {
  await showNow(1280);
  const row = page.getByRole('listitem').filter({ hasText: 'Зарядка' });
  await expect(row).toContainText('09:00');
  await expect(row).not.toContainText('Без времени');
  const title = await box(row.getByRole('button', { name: 'Зарядка' }));
  const done = await box(row.getByRole('button', { name: 'Выполнено' }));
  expect(done.x).toBeGreaterThan(title.x + 300);
  expect(Math.abs(done.y - title.y)).toBeLessThan(24);

  await showNow(420, 800);
  const narrowTitle = await box(row.getByRole('button', { name: 'Зарядка' }));
  const narrowDone = await box(row.getByRole('button', { name: 'Выполнено' }));
  expect(narrowDone.y).toBeGreaterThan(narrowTitle.y + narrowTitle.height - 1);
});
