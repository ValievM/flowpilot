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

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

const CALENDAR = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:math-1
SUMMARY:Математика
LOCATION:ауд. 204
DTSTART:20261005T143000Z
DTEND:20261005T160000Z
END:VEVENT
BEGIN:VEVENT
UID:design-1
SUMMARY:Проектирование
DTSTART:20261005T161500Z
DTEND:20261005T174500Z
END:VEVENT
END:VCALENDAR
`;

function calendarFile(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'flowpilot-ics-'));
  const file = path.join(directory, 'schedule.ics');
  writeFileSync(file, CALENDAR);
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

async function openView(name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name })
    .click();
}

async function importCalendar(): Promise<void> {
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page
    .getByRole('button', { name: 'Импортировать расписание (.ics)' })
    .click();
  await expect(
    page.getByRole('group', { name: 'Предпросмотр импорта' }),
  ).toContainText('Найдено событий: 2');
}

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
  await chooseFile(calendarFile());
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('import shows a preview, loads only after confirmation, and a second import adds no copies', async () => {
  await importCalendar();
  await expect(page.getByText('Источников пока нет.')).toBeVisible();
  await page.getByRole('button', { name: 'Загрузить 2 событий' }).click();
  await expect(page.getByText(/Загружено событий: 2/)).toBeVisible();
  await expect(page.locator('.schedule-source-list')).toContainText(
    'событий: 2',
  );

  await page
    .getByRole('button', { name: 'Импортировать расписание (.ics)' })
    .click();
  await page.getByRole('button', { name: 'Загрузить 2 событий' }).click();
  await expect(page.locator('.schedule-source-list')).toContainText(
    'событий: 2',
  );
});

test('Today shows the imported classes, and Now names the nearest one', async () => {
  await importCalendar();
  await page.getByRole('button', { name: 'Загрузить 2 событий' }).click();
  await expect(page.getByText(/Загружено событий/)).toBeVisible();
  await openView('Сегодня');
  const strip = page.getByRole('region', { name: 'Расписание' });
  await expect(strip).toContainText('Математика');
  await expect(strip).toContainText('14:30 — 16:00');
  await expect(strip).toContainText('ауд. 204');
  await openView('Сейчас');
  await expect(page.getByText(/Ближайшее занятие:/)).toBeVisible();
});

test('a manual weekly class can be added, shows up on Today, and can be removed', async () => {
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Добавить занятие' }).click();
  await page.getByLabel('Название занятия').fill('Тренировка');
  await page.getByRole('checkbox', { name: 'Пн' }).check();
  await page.getByLabel('Начало').fill('18:00');
  await page.getByLabel('Конец').fill('19:00');
  await page.getByRole('button', { name: 'Добавить занятие' }).last().click();
  await expect(page.locator('.manual-events')).toContainText('Тренировка');
  await openView('Сегодня');
  await expect(page.getByRole('region', { name: 'Расписание' })).toContainText(
    '18:00 — 19:00',
  );
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page
    .getByRole('button', { name: 'Удалить занятие: Тренировка' })
    .click();
  await expect(page.getByText('Своих занятий пока нет.')).toBeVisible();
});

test('without a schedule Today invites an import and never says free', async () => {
  const strip = page.getByRole('region', { name: 'Расписание' });
  await expect(strip).toContainText('Расписания пока нет');
  await expect(strip).not.toContainText(/свободно/i);
});

for (const theme of ['light', 'dark'] as const) {
  test(`Today with the schedule strip looks right in the ${theme} theme`, async () => {
    await page.emulateMedia({ colorScheme: theme });
    await importCalendar();
    await page.getByRole('button', { name: 'Загрузить 2 событий' }).click();
    await expect(page.getByText(/Загружено событий/)).toBeVisible();
    await openView('Сегодня');
    await expect(
      page.getByRole('region', { name: 'Расписание' }),
    ).toContainText('Математика');
    await expect(page).toHaveScreenshot(`schedule-today-${theme}.png`);
  });
}
