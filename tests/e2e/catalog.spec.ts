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
          kind: 'discipline.create',
          discipline: { id: 'disc-math', name: 'Математика', color: 'study' },
        },
        {
          kind: 'taskType.create',
          taskType: { id: 'type-lab', name: 'Лабораторная' },
        },
        {
          kind: 'task.create',
          task: {
            id: 'cat-1',
            title: 'Решить задачи',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: '2026-10-05',
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 1,
          },
        },
        {
          kind: 'task.classify',
          taskId: 'cat-1',
          disciplineId: 'disc-math',
          typeId: 'type-lab',
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

async function classifyOf(): Promise<
  { typeId?: string | undefined; disciplineId?: string | undefined } | undefined
> {
  return page.evaluate(async () => {
    const result = await window.flowpilot.snapshot.load();
    const task = result.ok
      ? result.value.tasks.find((item) => item.id === 'cat-1')
      : undefined;
    return task
      ? { typeId: task.typeId, disciplineId: task.disciplineId }
      : undefined;
  });
}

test('the discipline name shows in the day list, never its id', async () => {
  await expect(page.locator('.task-row').getByText('Математика')).toBeVisible();
  await expect(page.locator('.task-row')).not.toContainText('disc-math');
});

test('a new type is created from the card list and attached to the task', async () => {
  await page
    .getByRole('button', { name: 'Открыть задачу: Решить задачи' })
    .click();
  const card = page.locator('.task-card');
  await card.getByLabel('Тип').selectOption('__create__');
  await card.getByLabel('Название нового типа').fill('Экзамен');
  await card.getByRole('button', { name: 'Добавить тип' }).click();
  await expect(card.getByLabel('Тип')).toHaveText(/Экзамен/);
  const catalog = await page.evaluate(async () => {
    const result = await window.flowpilot.catalog.list();
    return result.ok ? result.value.taskTypes.map((item) => item.name) : [];
  });
  expect(catalog).toContain('Экзамен');
  expect((await classifyOf())?.typeId).not.toBe('type-lab');
});

test('deleting a used type asks what to do with the binding first', async () => {
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Удалить: Лабораторная' }).click();
  const dialog = page.getByRole('dialog', { name: /Удалить тип/ });
  await expect(dialog).toContainText('Привязано задач: 1');
  await expect(
    dialog.getByRole('button', { name: 'Удалить тип' }),
  ).toBeDisabled();
  await dialog.getByLabel('Что сделать с привязкой').selectOption('__detach__');
  await dialog.getByRole('button', { name: 'Удалить тип' }).click();
  await expect(page.getByText('Лабораторная')).toHaveCount(0);
  expect((await classifyOf())?.typeId).toBeUndefined();
});

for (const theme of ['light', 'dark'] as const) {
  test(`types and disciplines in settings look right in the ${theme} theme`, async () => {
    await page.emulateMedia({ colorScheme: theme });
    await page.getByRole('button', { name: 'Настройки' }).click();
    await expect(
      page.getByRole('heading', { name: 'Типы и дисциплины' }),
    ).toBeVisible();
    await page
      .getByRole('heading', { name: 'Типы и дисциплины' })
      .scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot(`catalog-settings-${theme}.png`);
  });
}
