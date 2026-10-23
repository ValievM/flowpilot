import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  TEST_NOW,
} from './smoke-fixtures';

let app: ElectronApplication | undefined;
let page: Page;
const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'flowpilot-ac-'));
  roots.push(root);
  return root;
}

function newProfile(): string {
  const profile = createSmokeProfile();
  roots.push(profile);
  return profile;
}

async function launch(profile: string): Promise<void> {
  ({ app, page } = await launchSmokeApp(profile, TEST_NOW));
}

async function restart(profile: string): Promise<void> {
  await app?.close();
  app = undefined;
  await launch(profile);
}

async function chooseInDialog(paths: string[]): Promise<void> {
  await app?.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showOpenDialog: () =>
        Promise.resolve({ canceled: false, filePaths: selected }),
    });
  }, paths);
}

async function openView(name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name })
    .click();
}

test.afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  for (const root of roots.splice(0)) removeSmokeProfile(root);
});

test('AC-02 release-1 (manual part): subtasks, comment and file survive a restart; the last subtask does not finish the task', async () => {
  const profile = newProfile();
  await launch(profile);
  const attachment = path.join(tempRoot(), 'условие.txt');
  writeFileSync(attachment, 'вымышленное условие');
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByLabel('Что нужно сделать?').fill('Подготовить доклад');
  await page.getByLabel('Что нужно сделать?').press('Enter');
  const opener = page.getByRole('button', {
    name: 'Открыть задачу: Подготовить доклад',
  });
  await opener.click();
  const card = page.locator('.task-card');
  for (const title of ['Собрать источники', 'Написать план']) {
    await card.getByLabel('Новая подзадача').fill(title);
    await card.getByLabel('Новая подзадача').press('Enter');
    await expect(card.getByText(title)).toBeVisible();
  }
  for (const title of ['Собрать источники', 'Написать план']) {
    const box = card.getByRole('checkbox', { name: title });
    await box.click();
    await expect(box).toBeChecked();
  }
  await card.getByLabel('Новый комментарий').fill('Первый вариант готов');
  await card.getByLabel('Новый комментарий').press('Enter');
  await expect(card.getByText('Первый вариант готов')).toBeVisible();
  await chooseInDialog([attachment]);
  await card.getByRole('button', { name: 'Добавить файл' }).click();
  await expect(card.getByText('условие.txt')).toBeVisible();
  const statusOf = (): Promise<string | undefined> =>
    page.evaluate(async () => {
      const result = await window.flowpilot.snapshot.load();
      return result.ok ? result.value.tasks[0]?.status.kind : undefined;
    });
  expect(await statusOf()).toBe('todo');

  await restart(profile);
  await page
    .getByRole('button', { name: /^Открыть задачу/ })
    .first()
    .click();
  const reopened = page.locator('.task-card');
  await expect(
    reopened.getByRole('checkbox', { name: 'Собрать источники' }),
  ).toBeChecked();
  await expect(
    reopened.getByRole('checkbox', { name: 'Написать план' }),
  ).toBeChecked();
  await expect(reopened.getByText('Первый вариант готов')).toBeVisible();
  await expect(reopened.getByText('условие.txt')).toBeVisible();
  expect(await statusOf()).toBe('todo');
});

test('AC-05 release-1: a repeat instance can be done or skipped without touching other days; missed dates group and need confirmation to close', async () => {
  const profile = newProfile();
  await launch(profile);
  const seeded = await page.evaluate(async () => {
    const outcomes = [
      ['done', '2026-09-14'],
      ['skipped', '2026-09-16'],
      ['done', '2026-09-18'],
      ['skipped', '2026-09-21'],
      ['done', '2026-09-23'],
      ['done', '2026-09-25'],
      ['skipped', '2026-09-28'],
      ['done', '2026-09-30'],
      ['done', '2026-10-02'],
    ] as const;
    const result = await window.flowpilot.commands.apply({
      expectedRevision: 0,
      commands: [
        {
          kind: 'series.create',
          series: {
            id: 'ac05-training',
            title: 'Тренировка',
            weekdays: [1, 3, 5],
            time: '18:00',
            startsOn: '2026-09-14',
          },
        },
        {
          kind: 'series.create',
          series: {
            id: 'ac05-reading',
            title: 'Чтение',
            weekdays: [1, 2, 3, 4, 5],
            startsOn: '2026-10-05',
          },
        },
        ...outcomes.map(([kind, date]) => ({
          kind: 'series.recordOutcome' as const,
          seriesId: 'ac05-training',
          outcome: { kind, date },
        })),
      ],
    });
    return result.ok;
  });
  expect(seeded).toBe(true);
  await page.reload();
  const outcomeCount = (): Promise<number> =>
    page.evaluate(async () => {
      const result = await window.flowpilot.snapshot.load();
      return result.ok ? result.value.outcomes.length : -1;
    });

  const today = page.getByRole('region', { name: 'Повторы сегодня' });
  await expect(today).toContainText('Тренировка');
  await expect(today).toContainText('18:00');
  const groups = page.getByRole('region', { name: 'Пропуски' });
  await expect(
    groups.getByRole('button', { name: 'Тренировка ×3' }),
  ).toBeVisible();

  await openView('Сейчас');
  const now = page.getByRole('region', { name: 'Повторы сейчас' });
  await expect(now).toContainText('Чтение');
  await expect(now).not.toContainText('Тренировка');

  await openView('Сегодня');
  await page
    .getByRole('region', { name: 'Повторы сегодня' })
    .getByRole('listitem')
    .filter({ hasText: 'Тренировка' })
    .getByRole('button', { name: 'Выполнено' })
    .click();
  await expect.poll(outcomeCount).toBe(10);
  const series = await page.evaluate(async () => {
    const result = await window.flowpilot.snapshot.load();
    return result.ok ? result.value.series.length : -1;
  });
  expect(series).toBe(2);

  await groups.getByRole('button', { name: 'Тренировка ×3' }).click();
  page.once('dialog', (dialog) => void dialog.dismiss());
  await groups.getByRole('button', { name: 'Закрыть' }).first().click();
  await expect.poll(outcomeCount).toBe(10);
  page.once('dialog', (dialog) => void dialog.accept());
  await groups.getByRole('button', { name: 'Закрыть' }).first().click();
  await expect(
    groups.getByRole('button', { name: 'Тренировка ×2' }),
  ).toBeVisible();
});

test('AC-12 release-1: export restores into an empty profile and a damaged package is refused', async () => {
  const source = newProfile();
  await launch(source);
  const seeded = await page.evaluate(async () => {
    const result = await window.flowpilot.commands.apply({
      expectedRevision: 0,
      commands: ['Первая задача', 'Вторая задача'].map((title, index) => ({
        kind: 'task.create' as const,
        task: {
          id: `ac12-${index.toString()}`,
          title,
          status: { kind: 'todo' as const },
          columnId: 'todo',
          day: '2026-10-05',
          subtasks: [],
          comments: [{ id: `ac12-c${index.toString()}`, text: 'Заметка' }],
          attachments: [],
          addedOrder: index + 1,
        },
      })),
    });
    return result.ok;
  });
  expect(seeded).toBe(true);
  const exportRoot = tempRoot();
  await chooseInDialog([exportRoot]);
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Экспортировать' }).click();
  await expect(
    page.getByText(/Резервная копия сохранена: .*FlowPilot-export-/),
  ).toBeVisible();
  const exported = path.join(
    exportRoot,
    readdirSync(exportRoot).find((name) =>
      name.startsWith('FlowPilot-export-'),
    ) ?? '',
  );

  const damaged = path.join(tempRoot(), 'damaged');
  cpSync(exported, damaged, { recursive: true });
  const victim = readdirSync(damaged).find(
    (name) => name.endsWith('.json') && name !== 'manifest.json',
  );
  expect(victim).toBeDefined();
  appendFileSync(path.join(damaged, victim ?? ''), ' ');

  const empty = newProfile();
  await app?.close();
  await launch(empty);
  const taskCount = (): Promise<number> =>
    page.evaluate(async () => {
      const result = await window.flowpilot.snapshot.load();
      return result.ok ? result.value.tasks.length : -1;
    });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await chooseInDialog([damaged]);
  await page.getByRole('button', { name: 'Восстановить из папки' }).click();
  await expect(page.getByRole('alert')).toContainText('проблемы');
  await expect(
    page.getByRole('button', { name: 'Восстановить данные' }),
  ).toHaveCount(0);
  expect(await taskCount()).toBe(0);

  await chooseInDialog([exported]);
  await page.getByRole('button', { name: 'Восстановить из папки' }).click();
  await page.getByRole('button', { name: 'Восстановить данные' }).click();
  await expect.poll(taskCount).toBe(2);
  await openView('Все задачи');
  await expect(page.getByText('Первая задача').first()).toBeVisible();
  await expect(page.getByText('Вторая задача').first()).toBeVisible();
});
