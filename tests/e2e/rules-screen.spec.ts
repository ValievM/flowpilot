import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
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
let profilePath: string;

const ruleDocument = (id: string, title: string, typeIds: string[]) => ({
  schema_version: 'v1',
  id,
  title,
  scope: { task_type_ids: typeIds },
  rules: [{ id: 'p1', kind: 'priority', level: 'high', reason: 'Важно' }],
  guidance: 'Начинать заранее.',
});

function ruleFile(content: unknown): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'flowpilot-rule-'));
  const file = path.join(directory, 'rule.json');
  writeFileSync(file, JSON.stringify(content));
  return file;
}

async function chooseRuleFile(file: string): Promise<void> {
  await app?.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showOpenDialog: () =>
        Promise.resolve({ canceled: false, filePaths: [selected] }),
    });
  }, file);
}

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  const seeded = await page.evaluate(async () => {
    const result = await window.flowpilot.commands.apply({
      expectedRevision: 0,
      commands: [
        {
          kind: 'taskType.create',
          taskType: { id: 'type-course', name: 'Курсовая' },
        },
        {
          kind: 'taskType.create',
          taskType: { id: 'type-lab', name: 'Лабораторная' },
        },
      ],
    });
    return result.ok;
  });
  expect(seeded).toBe(true);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Правила' })
    .click();
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('empty state explains that cards need no invented reasons', async () => {
  await expect(page.getByText(/Правил пока нет/)).toBeVisible();
});

test('an imported document is a draft, can be bound, activated and exported, with no dialog on the way', async () => {
  await chooseRuleFile(
    ruleFile(ruleDocument('r-study', 'Учебные проекты', ['type-course'])),
  );
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  const card = page.getByRole('article', { name: 'Учебные проекты' });
  await expect(card).toContainText('Черновик');
  await expect(card).toContainText('Курсовая');
  await page
    .getByRole('button', { name: 'Активировать: Учебные проекты' })
    .click();
  await expect(card).toContainText('Активно');
  await page
    .getByRole('button', { name: 'Привязать: Учебные проекты' })
    .click();
  await page.getByRole('checkbox', { name: 'Лабораторная' }).check();
  await page.getByRole('button', { name: 'Сохранить привязку' }).click();
  await expect(card).toContainText('Курсовая, Лабораторная');
  await expect(card).toContainText('Отключено');
  await page
    .getByRole('button', { name: 'Активировать: Учебные проекты' })
    .click();
  await expect(card).toContainText('Активно');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a document with a wrong type shows the field path and keeps the earlier version', async () => {
  await chooseRuleFile(
    ruleFile(ruleDocument('r-study', 'Учебные проекты', ['type-course'])),
  );
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  await page
    .getByRole('button', { name: 'Активировать: Учебные проекты' })
    .click();
  await chooseRuleFile(
    ruleFile(ruleDocument('r-study', 'Учебные проекты', ['labs-old'])),
  );
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('scope.task_type_ids');
  await expect(alert).toContainText('Прежняя рабочая версия осталась');
});

for (const theme of ['light', 'dark'] as const) {
  test(`rules screen looks right in the ${theme} theme`, async () => {
    await page.emulateMedia({ colorScheme: theme });
    await chooseRuleFile(
      ruleFile(ruleDocument('r-study', 'Учебные проекты', ['type-course'])),
    );
    await page.getByRole('button', { name: 'Импортировать файл' }).click();
    await expect(
      page.getByRole('article', { name: 'Учебные проекты' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(`rules-${theme}.png`);
  });
}
