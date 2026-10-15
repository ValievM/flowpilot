import { expect, test } from '@playwright/test';
import type {
  BrowserContext,
  ElectronApplication,
  Page,
} from '@playwright/test';
import type { CommandsApplyRequest } from '../../src/shared/contracts';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  TEST_NOW,
  TODAY,
} from './smoke-fixtures';

type SeedTask = Extract<
  CommandsApplyRequest['commands'][number],
  { kind: 'task.create' }
>['task'];

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;
const profiles: string[] = [];
const externalRequests: string[] = [];

async function launch(
  now: string,
  beforeWindowLoad?: (context: BrowserContext) => Promise<void>,
): Promise<void> {
  profilePath = createSmokeProfile();
  profiles.push(profilePath);
  ({ app, page } = await launchSmokeApp(
    profilePath,
    now,
    true,
    beforeWindowLoad,
  ));
}

async function seed(tasks: readonly SeedTask[]): Promise<void> {
  const result = await page.evaluate(
    (seededTasks) =>
      window.flowpilot.commands.apply({
        expectedRevision: 0,
        commands: seededTasks.map((task) => ({
          kind: 'task.create' as const,
          task,
        })),
      }),
    tasks,
  );
  expect(result).toMatchObject({ ok: true, value: { revision: 1 } });
}

async function openView(name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name })
    .click();
}

test.beforeEach(async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  profiles.length = 0;
  externalRequests.length = 0;
  const monitorStartupRequests = async (context: BrowserContext) => {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        externalRequests.push(url.href);
        await route.abort();
        return;
      }
      await route.continue();
    });
  };
  await launch(
    TEST_NOW,
    testInfo.title.startsWith('AC-01') ? monitorStartupRequests : undefined,
  );
});

test.afterEach(async () => {
  if (app) await app.close();
  for (const profile of profiles) removeSmokeProfile(profile);
});

test('AC-01 release-1: today is in Сейчас, future/done/waiting are excluded and external requests are zero', async () => {
  await seed([
    {
      id: 'ac01-today',
      title: 'Сегодняшняя работа',
      description: '',
      status: { kind: 'todo' },
      columnId: 'todo',
      day: TODAY,
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    },
    {
      id: 'ac01-future',
      title: 'Будущая работа',
      description: '',
      status: { kind: 'todo' },
      columnId: 'todo',
      day: '2026-10-06',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 1,
    },
    {
      id: 'ac01-done',
      title: 'Готовая работа',
      description: '',
      status: { kind: 'done' },
      columnId: 'done',
      day: TODAY,
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 2,
    },
    {
      id: 'ac01-waiting',
      title: 'Ожидающая работа',
      description: '',
      status: { kind: 'waiting', reason: 'Ждём ответ' },
      columnId: 'waiting',
      day: TODAY,
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 3,
    },
  ]);
  await page.reload();
  await openView('Сейчас');
  await expect(
    page.getByRole('heading', { name: 'Сегодняшняя работа', level: 2 }),
  ).toBeVisible();
  for (const title of ['Будущая работа', 'Готовая работа', 'Ожидающая работа'])
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('AC-13 release-1: quick entry rejects empty title and persists after restart', async () => {
  await page.getByRole('button', { name: 'Задача' }).click();
  const title = page.getByLabel('Что нужно сделать?');
  const submit = page.getByRole('button', { name: 'Добавить задачу' });
  await expect(submit).toBeDisabled();
  await title.fill('   ');
  await expect(submit).toBeDisabled();
  expect(
    await page.evaluate(() => window.flowpilot.snapshot.load()),
  ).toMatchObject({
    ok: true,
    value: { tasks: [], revision: 0 },
  });
  await title.fill('Подготовить заметки');
  await submit.click();
  await expect(
    page.getByRole('heading', { name: 'Подготовить заметки', level: 3 }),
  ).toBeVisible();
  await app?.close();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  await expect(
    page.getByRole('heading', { name: 'Подготовить заметки', level: 3 }),
  ).toBeVisible();
  await openView('Сейчас');
  await expect(
    page.getByRole('heading', { name: 'Подготовить заметки', level: 2 }),
  ).toBeVisible();
});

test('AC-04 release-1: Waiting requires a reason, stays out of Сейчас, and nonempty column deletion requires reassignment', async () => {
  await seed([
    {
      id: 'ac04-waiting',
      title: 'Ответ преподавателя',
      description: '',
      status: { kind: 'todo' },
      columnId: 'todo',
      day: TODAY,
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    },
    {
      id: 'ac04-reassign',
      title: 'Перенос при удалении',
      description: '',
      status: { kind: 'todo' },
      columnId: 'todo',
      day: TODAY,
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 1,
    },
  ]);
  await openView('Доска');
  const first = page.getByRole('article', {
    name: 'Задача: Ответ преподавателя',
  });
  await first.getByRole('button', { name: 'Переместить в…' }).click();
  await page.getByRole('menuitem', { name: 'Ожидание' }).click();
  const waitingDialog = page.getByRole('dialog', {
    name: 'Почему задача ожидает?',
  });
  const move = waitingDialog.getByRole('button', { name: 'Переместить' });
  await expect(move).toBeDisabled();
  await waitingDialog.getByLabel(/Причина/).fill('Ждём ответ преподавателя');
  await move.click();
  await expect(
    page.getByText('Причина ожидания: Ждём ответ преподавателя'),
  ).toBeVisible();
  const columnName = 'Ответ позже';
  await page.getByRole('button', { name: 'Добавить колонку' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Новая колонка' });
  await createDialog.getByLabel('Название').fill(columnName);
  await createDialog.getByRole('button', { name: 'Сохранить' }).click();
  const second = page.getByRole('article', {
    name: 'Задача: Перенос при удалении',
  });
  await second.getByRole('button', { name: 'Переместить в…' }).click();
  await page.getByRole('menuitem', { name: columnName }).click();
  const column = page.getByRole('region', { name: columnName });
  await expect(
    column.getByRole('article', { name: 'Задача: Перенос при удалении' }),
  ).toBeVisible();
  await column.getByRole('button', { name: 'Удалить колонку' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Удалить колонку?' });
  const confirmDelete = deleteDialog.getByRole('button', {
    name: 'Удалить колонку',
  });
  await expect(confirmDelete).toBeDisabled();
  await deleteDialog.getByLabel('Переместить карточки в').selectOption('todo');
  await expect(confirmDelete).toBeEnabled();
  await confirmDelete.click();
  const todoColumn = page.getByRole('region', { name: 'Сделать' });
  await expect(
    todoColumn.getByRole('article', { name: 'Задача: Перенос при удалении' }),
  ).toHaveCount(1);
  await openView('Сейчас');
  await expect(
    page.getByRole('heading', { name: 'Ответ преподавателя' }),
  ).toHaveCount(0);
});
