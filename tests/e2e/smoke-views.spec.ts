import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  SNAPSHOT_NOW_INSTANT,
  TEST_NOW,
  TODAY,
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

test('shows a saved task and keyboard accessible navigation', async () => {
  await page.getByRole('button', { name: 'Задача' }).click();
  await page
    .getByLabel('Что нужно сделать?')
    .fill('Задача из сохранённого снимка');
  await page.getByLabel('Что нужно сделать?').press('Enter');
  await expect(
    page.getByRole('heading', {
      name: 'Задача из сохранённого снимка',
      level: 3,
    }),
  ).toBeVisible();
  const snapshot = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(snapshot).toMatchObject({
    ok: true,
    value: {
      revision: 1,
      tasks: [{ title: 'Задача из сохранённого снимка' }],
    },
  });
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Задача из сохранённого снимка' }),
  ).toBeVisible();
});

test('shows neutral unknown and danger risk colors on Board and All in Electron', async () => {
  const created = await page.evaluate(
    ({ day, deadline }) =>
      window.flowpilot.commands.apply({
        expectedRevision: 0,
        commands: [
          {
            kind: 'task.create',
            task: {
              id: 'unknown-risk',
              title: 'Объём неизвестен',
              description: '',
              status: { kind: 'todo' },
              columnId: 'todo',
              day,
              deadline,
              subtasks: [],
              comments: [],
              attachments: [],
              addedOrder: 0,
            },
          },
          {
            kind: 'task.create',
            task: {
              id: 'tight-risk',
              title: 'Запас исчерпан',
              description: '',
              status: { kind: 'todo' },
              columnId: 'todo',
              day,
              deadline,
              estimate: { unit: 'workdays', value: 5 },
              subtasks: [],
              comments: [],
              attachments: [],
              addedOrder: 1,
            },
          },
        ],
      }),
    { day: TODAY, deadline: '2026-10-09' },
  );
  expect(created).toMatchObject({ ok: true });
  await page.reload();

  for (const view of ['Доска', 'Все задачи']) {
    await page
      .getByRole('navigation', { name: 'Представления' })
      .getByRole('button', { name: view })
      .click();
    const unknown = page.locator('[data-risk-kind="unknown"]');
    const tight = page.locator('[data-risk-kind="tight"]');
    await expect(unknown).toBeVisible();
    await expect(unknown).toHaveClass(/risk-unknown/);
    await expect(tight).toBeVisible();
    await expect(tight).toHaveClass(/is-risk/);
    await expect(tight).toHaveAttribute('title', 'Риск не успеть');
    const colors = {
      unknown: await unknown.evaluate(
        (element) => getComputedStyle(element).color,
      ),
      tight: await tight.evaluate((element) => getComputedStyle(element).color),
      expected: await page.evaluate(() => {
        const measure = (token: string): string => {
          const probe = document.createElement('span');
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        return { neutral: measure('--muted'), danger: measure('--danger') };
      }),
    };
    expect(colors.unknown).toBe(colors.expected.neutral);
    expect(colors.tight).toBe(colors.expected.danger);
  }
});
