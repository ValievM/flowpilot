import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
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

async function launch(now: string): Promise<void> {
  profilePath = createSmokeProfile();
  profiles.push(profilePath);
  ({ app, page } = await launchSmokeApp(profilePath, now));
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

test.beforeEach(async () => {
  profiles.length = 0;
  await launch(TEST_NOW);
});

test.afterEach(async () => {
  if (app) await app.close();
  for (const profile of profiles) removeSmokeProfile(profile);
});

test('AC-03 release-1: yesterday Doing rolls over after next-day restart with the same ID and original deadline', async () => {
  const yesterday = '2026-10-05';
  await seed([
    {
      id: 'ac03-long-task',
      title: 'Продолжить проект',
      description: 'Сохранённый комментарий',
      status: { kind: 'doing' },
      columnId: 'doing',
      day: yesterday,
      deadline: '2026-10-20',
      subtasks: [
        { id: 'ac03-subtask', title: 'Проверить материалы', completed: true },
      ],
      comments: [{ id: 'ac03-comment', text: 'Комментарий остаётся' }],
      attachments: [],
      addedOrder: 0,
    },
  ]);
  await app?.close();
  const tomorrowNow = '2026-10-06T12:00:00Z';
  ({ app, page } = await launchSmokeApp(profilePath, tomorrowNow));
  await expect(
    page.getByRole('heading', { name: 'Продолжить проект', level: 3 }),
  ).toHaveCount(1);
  await expect(
    page.getByText('Перенесено со вчера', { exact: true }),
  ).toBeVisible();
  const snapshot = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(snapshot).toMatchObject({
    ok: true,
    value: {
      tasks: [{ id: 'ac03-long-task', day: yesterday, deadline: '2026-10-20' }],
    },
  });
  if (!snapshot.ok) throw new Error('Task snapshot could not be loaded');
  expect(
    snapshot.value.tasks.filter((task) => task.id === 'ac03-long-task'),
  ).toHaveLength(1);
  expect(snapshot.value.tasks[0]?.subtasks).toEqual([
    { id: 'ac03-subtask', title: 'Проверить материалы', completed: true },
  ]);
  expect(snapshot.value.tasks[0]?.comments).toEqual([
    { id: 'ac03-comment', text: 'Комментарий остаётся' },
  ]);
  await openView('Доска');
  await expect(
    page.getByRole('article', { name: 'Задача: Продолжить проект' }),
  ).toHaveCount(1);
  await openView('Все задачи');
  await expect(
    page.getByRole('heading', { name: 'Продолжить проект', level: 2 }),
  ).toHaveCount(1);
});

test('AC-09 release-1: risk interface matches table rows 2, 4, 10, and 12', async () => {
  const cases = [
    {
      title: 'Срок без запаса',
      day: '2026-10-05',
      deadline: '2026-10-09',
      estimate: { unit: 'workdays' as const, value: 5 },
      expected: /Риск не успеть.*До срока 5 рабочих дней.*запас исчерпан/i,
    },
    {
      title: 'Неизвестный объём',
      day: '2026-10-05',
      deadline: '2026-10-09',
      estimate: undefined,
      expected: /Срок есть, объём неизвестен/i,
    },
  ];
  await seed(
    cases.map((scenario, addedOrder) => ({
      id: `ac09-${scenario.title}`,
      title: scenario.title,
      description: '',
      status: { kind: 'todo' as const },
      columnId: 'todo',
      day: scenario.day,
      deadline: scenario.deadline,
      estimate: scenario.estimate,
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder,
    })),
  );
  await page.reload();
  await openView('Все задачи');
  for (const scenario of cases) {
    const task = page.getByRole('article').filter({ hasText: scenario.title });
    await expect(task.locator('.risk-label')).toContainText(scenario.expected);
  }

  if (app) await app.close();
  await launch('2026-10-08T12:00:00Z');
  await seed([
    {
      id: 'ac09-shorter-than-estimate',
      title: 'Срок короче оценки',
      description: '',
      status: { kind: 'todo' },
      columnId: 'todo',
      day: '2026-10-08',
      deadline: '2026-10-09',
      estimate: { unit: 'workdays', value: 4 },
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    },
  ]);
  await page.reload();
  await openView('Все задачи');
  const todayTask = page
    .getByRole('article')
    .filter({ hasText: 'Срок короче оценки' });
  await expect(todayTask.locator('.risk-label')).toContainText(
    /Риск не успеть.*Осталось 2 рабочих дня.*оценка остатка 4 рабочих дня/i,
  );

  if (app) await app.close();
  await launch('2026-10-09T12:00:00Z');
  await seed([
    {
      id: 'ac09-overdue',
      title: 'Срок прошёл',
      description: '',
      status: { kind: 'todo' },
      columnId: 'todo',
      day: '2026-10-09',
      deadline: '2026-10-08',
      estimate: { unit: 'workdays', value: 2 },
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    },
  ]);
  await page.reload();
  await expect(page.locator('.risk-label').first()).toContainText(
    /Срок прошёл.*По приблизительной оценке/i,
  );
});

test('AC-12 release-1: persisted cards remain after restarting the same profile; undo is not present', async () => {
  await seed([
    {
      id: 'ac12-persisted',
      title: 'Сохранённая карточка',
      description: '',
      status: { kind: 'todo' },
      columnId: 'todo',
      day: TODAY,
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    },
  ]);
  await app?.close();
  ({ app, page } = await launchSmokeApp(profilePath, '2026-10-05T18:00:00Z'));
  await expect(
    page.getByRole('heading', { name: 'Сохранённая карточка', level: 3 }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /отменить/i })).toHaveCount(0);
});
