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

const REPLY = JSON.stringify({
  commands: [
    {
      kind: 'task.update',
      id: 'rp-course',
      changes: { day: '2026-10-06' },
    },
    { kind: 'task.setAiRank', taskId: 'rp-lab', rank: 0 },
  ],
  rationale: 'Курсовая требует около четырёх дней; лабораторную — вперёд.',
});

function seedTask(id: string, title: string, order: number) {
  return {
    kind: 'task.create' as const,
    task: {
      id,
      title,
      status: { kind: 'todo' as const },
      columnId: 'todo',
      day: '2026-10-05',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: order,
    },
  };
}

async function launch(mode: 'auto' | 'confirm'): Promise<void> {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(
    profilePath,
    TEST_NOW,
    true,
    undefined,
    { FLOWPILOT_TEST_AI_REPLY: REPLY },
  ));
  const seeded = await page.evaluate(
    async ({ aiMode, first, second }) => {
      const result = await window.flowpilot.commands.apply({
        expectedRevision: 0,
        commands: [
          first,
          second,
          { kind: 'setting.set', key: 'aiMode', value: aiMode },
        ],
      });
      return result.ok;
    },
    {
      aiMode: mode,
      first: seedTask('rp-course', 'Курсовая', 1),
      second: seedTask('rp-lab', 'Лабораторная', 2),
    },
  );
  expect(seeded).toBe(true);
  await page.reload();
}

async function dayOfCourse(): Promise<string | undefined> {
  return page.evaluate(async () => {
    const result = await window.flowpilot.snapshot.load();
    return result.ok
      ? result.value.tasks.find((task) => task.id === 'rp-course')?.day
      : undefined;
  });
}

test.afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  removeSmokeProfile(profilePath);
});

test('Replan shows before and after, changes nothing until confirmed, then applies', async () => {
  await launch('confirm');
  await expect(
    page.getByRole('heading', { name: 'Перестроить порядок' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Перестроить', exact: true }).click();
  const table = page.getByRole('table', { name: 'До и после' });
  await expect(table).toContainText('Курсовая');
  await expect(table).toContainText('06.10.2026');
  expect(await dayOfCourse()).toBe('2026-10-05');

  await page.getByRole('button', { name: 'Основание' }).click();
  await expect(page.getByText(/около четырёх дней/)).toBeVisible();
  await page.getByRole('button', { name: 'Применить изменения' }).click();
  await expect(page.getByText('Порядок перестроен.')).toBeVisible();
  expect(await dayOfCourse()).toBe('2026-10-06');
});

test('a proposal goes stale when the data changes, and cannot be applied', async () => {
  await launch('confirm');
  await page.getByRole('button', { name: 'Перестроить', exact: true }).click();
  await expect(page.getByRole('table', { name: 'До и после' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByLabel('Что нужно сделать?').fill('Новая задача');
  await page.getByLabel('Что нужно сделать?').press('Enter');
  await expect(
    page.getByText(/Данные изменились после подготовки/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Применить изменения' }),
  ).toBeDisabled();
  expect(await dayOfCourse()).toBe('2026-10-05');
});

test('auto mode applies at once and the result can be undone', async () => {
  await launch('auto');
  await page.getByRole('button', { name: 'Перестроить', exact: true }).click();
  await expect(page.getByText('Порядок перестроен.')).toBeVisible();
  expect(await dayOfCourse()).toBe('2026-10-06');
  await page
    .locator('.replan-card')
    .getByRole('button', { name: 'Отменить' })
    .click();
  await expect(page.getByText('Изменения отменены.')).toBeVisible();
  expect(await dayOfCourse()).toBe('2026-10-05');
});

for (const theme of ['light', 'dark'] as const) {
  test(`replan proposal looks right in the ${theme} theme`, async () => {
    await launch('confirm');
    await page.emulateMedia({ colorScheme: theme });
    await page
      .getByRole('button', { name: 'Перестроить', exact: true })
      .click();
    await expect(page.getByRole('table', { name: 'До и после' })).toBeVisible();
    await expect(page).toHaveScreenshot(`replan-${theme}.png`);
  });
}
