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

async function launch(reply: unknown): Promise<void> {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(
    profilePath,
    TEST_NOW,
    true,
    undefined,
    { FLOWPILOT_TEST_AI_REPLY: JSON.stringify(reply) },
  ));
  const seeded = await page.evaluate(async () => {
    const result = await window.flowpilot.commands.apply({
      expectedRevision: 0,
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'wn-1',
            title: 'Прочитать главу 3',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: '2026-10-05',
            deadline: '2026-10-09',
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 1,
          },
        },
      ],
    });
    return result.ok;
  });
  expect(seeded).toBe(true);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
}

test.afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  removeSmokeProfile(profilePath);
});

test('Now opens without any AI request; the answer card starts the recommended task', async () => {
  await launch({
    action: { taskId: 'wn-1' },
    reason: 'Срок в пятницу, а остаток работы большой.',
  });
  await expect(
    page.getByRole('button', { name: 'Что делать сейчас?' }),
  ).toBeVisible();
  await expect(page.getByRole('article', { name: 'Совет AI' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Что делать сейчас?' }).click();
  const card = page.getByRole('article', { name: 'Совет AI' });
  await expect(card).toContainText('Прочитать главу 3');
  await card.getByRole('button', { name: 'Почему' }).click();
  await expect(card).toContainText('Срок в пятницу');
  await card.getByRole('button', { name: 'Начать' }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await window.flowpilot.snapshot.load();
        return result.ok ? result.value.tasks[0]?.status.kind : undefined;
      }),
    )
    .toBe('doing');
});

test('with nothing available the AI says why and nothing is assigned', async () => {
  await launch({ action: null, reason: 'Всё в ожидании или на будущее.' });
  await page.evaluate(async () => {
    await window.flowpilot.commands.apply({
      expectedRevision: 1,
      commands: [
        { kind: 'task.update', id: 'wn-1', changes: { day: '2026-10-20' } },
      ],
    });
  });
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
  await page.getByRole('button', { name: 'Что делать сейчас?' }).click();
  const card = page.getByRole('article', { name: 'Совет AI' });
  await expect(card).toContainText('Всё в ожидании');
  await expect(card.getByRole('button', { name: 'Начать' })).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`answer card looks right in the ${theme} theme`, async () => {
    await launch({
      action: { taskId: 'wn-1' },
      reason: 'Срок в пятницу, а остаток работы большой.',
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.getByRole('button', { name: 'Что делать сейчас?' }).click();
    await page
      .getByRole('article', { name: 'Совет AI' })
      .getByRole('button', { name: 'Почему' })
      .click();
    await expect(page).toHaveScreenshot(`what-now-${theme}.png`);
  });
}
