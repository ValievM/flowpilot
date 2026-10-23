import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  TEST_NOW,
} from './smoke-fixtures';

// F-07 / AC-01: the AI is asked only when the person asks, once per press.

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;
let outside: string[];

async function aiCalls(): Promise<number> {
  return (
    (await app?.evaluate(
      () =>
        (globalThis as { __FLOWPILOT_TEST_AI_CALLS__?: unknown[] })
          .__FLOWPILOT_TEST_AI_CALLS__?.length ?? -1,
    )) ?? -1
  );
}

async function launch(now: string): Promise<void> {
  ({ app, page } = await launchSmokeApp(profilePath, now));
  outside = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) outside.push(request.url());
  });
}

async function openView(name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name })
    .click();
}

function tempFile(name: string, content: string): string {
  const file = path.join(
    mkdtempSync(path.join(tmpdir(), 'flowpilot-hidden-')),
    name,
  );
  writeFileSync(file, content);
  return file;
}

async function chooseFile(file: string): Promise<void> {
  await app?.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showOpenDialog: () =>
        Promise.resolve({ canceled: false, filePaths: [selected] }),
    });
  }, file);
}

const CALENDAR = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:a
SUMMARY:Лекция
DTSTART:20261005T143000Z
DTEND:20261005T160000Z
END:VEVENT
END:VCALENDAR
`;
const RULE = JSON.stringify({
  schema_version: 'v1',
  id: 'rule-1',
  title: 'Правило',
  scope: { task_type_ids: [] },
  rules: [{ id: 'p', kind: 'priority', level: 'high', reason: 'Важно' }],
});

test.beforeEach(() => {
  profilePath = createSmokeProfile();
});

test.afterEach(async () => {
  if (app) await app.close();
  app = undefined;
  removeSmokeProfile(profilePath);
});

test('AC-01 F-07: ordinary work, imports, mode switch, a new day and 90 idle seconds never call the AI', async () => {
  test.setTimeout(240_000);
  await launch(TEST_NOW);
  expect(await aiCalls()).toBe(0);

  await page.keyboard.press('ControlOrMeta+K');
  await page.getByLabel('Что нужно сделать?').fill('Подготовить доклад');
  await page.getByLabel('Что нужно сделать?').press('Enter');
  await page
    .getByRole('button', { name: 'Открыть задачу: Подготовить доклад' })
    .click();
  await page
    .locator('.task-card')
    .getByLabel('Название')
    .fill('Подготовить доклад к пятнице');
  await page.locator('.task-card').getByLabel('Название').press('Tab');
  await page.getByRole('button', { name: 'Закрыть карточку задачи' }).click();

  await chooseFile(tempFile('schedule.ics', CALENDAR));
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page
    .getByRole('button', { name: 'Импортировать расписание (.ics)' })
    .click();
  await page.getByRole('button', { name: /Загрузить \d+ событий/ }).click();
  await expect(page.getByText(/Загружено событий/)).toBeVisible();

  await openView('Правила');
  await chooseFile(tempFile('rule.json', RULE));
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  await expect(page.getByRole('article', { name: 'Правило' })).toBeVisible();

  await openView('Чат с AI');
  await page.getByLabel('Режим AI').selectOption('confirm');
  await page.getByLabel('Режим AI').selectOption('auto');
  await openView('Сейчас');
  await openView('Доска');
  expect(await aiCalls()).toBe(0);

  await app?.close();
  await launch('2026-10-06T12:00:00Z');
  await openView('Чат с AI');
  await openView('Сегодня');
  expect(await aiCalls()).toBe(0);

  await page.waitForTimeout(90_000);
  expect(await aiCalls()).toBe(0);
  expect(outside).toEqual([]);
});

test('AC-01 F-07: each explicit press asks the AI exactly once, and a second press while waiting adds nothing', async () => {
  await launch(TEST_NOW);
  await openView('Чат с AI');
  expect(await aiCalls()).toBe(0);

  await page.getByLabel('Сообщение помощнику').fill('Подготовить доклад');
  await page.evaluate(() => {
    const send = [...document.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Отправить',
    );
    send?.click();
    send?.click();
  });
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect(await aiCalls()).toBe(1);

  await page
    .getByRole('button', { name: 'Перестроить', exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(
    page.getByRole('heading', { name: 'Перестроить порядок' }),
  ).toBeVisible();
  await expect.poll(aiCalls).toBe(2);

  await openView('Сейчас');
  await page
    .getByRole('button', { name: 'Что делать сейчас?' })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect.poll(aiCalls).toBe(3);
  await page.waitForTimeout(1500);
  expect(await aiCalls()).toBe(3);
  expect(outside).toEqual([]);
});
