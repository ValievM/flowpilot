import { expect, test } from '@playwright/test';
import {
  calendar,
  chooseFile,
  openView,
  ruleDocument,
  seedTasks,
  setAiMode,
  startSession,
  stopSession,
  tempFile,
  TODAY_DAY,
  type Session,
} from './release2-fixtures';

// Release 2 screens in both themes at the release 1 widths.
const WIDTHS = [900, 1280, 1440, 1728] as const;
const THEMES = ['light', 'dark'] as const;
const REPLAN = {
  commands: [{ kind: 'task.update', id: 'a', changes: { day: '2026-10-06' } }],
  rationale: 'Курсовая требует несколько дней.',
};
const CARDS = {
  cards: [{ title: 'Подготовить доклад', day: '2026-10-09', subtasks: [] }],
  unknowns: [],
};

type Screen = 'chat' | 'rules' | 'schedule' | 'replan' | 'stale';

let session: Session | undefined;

test.afterEach(async () => {
  await stopSession(session);
  session = undefined;
});

async function resize(width: number): Promise<void> {
  const current = session;
  if (!current) return;
  await current.app.evaluate(({ BrowserWindow }, size) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(size, 900);
  }, width);
  await current.page.setViewportSize({ width, height: 900 });
  expect(await current.page.evaluate(() => window.innerWidth)).toBe(width);
}

async function prepare(screen: Screen): Promise<Session> {
  const reply =
    screen === 'chat'
      ? CARDS
      : screen === 'replan' || screen === 'stale'
        ? REPLAN
        : undefined;
  const started = await startSession(reply);
  session = started;
  const { page, app } = started;
  if (screen === 'chat') {
    await setAiMode(page, 'confirm');
    await openView(page, 'Чат с AI');
    await page
      .getByLabel('Сообщение помощнику')
      .fill('Подготовить доклад к пятнице');
    await page.getByRole('button', { name: 'Отправить' }).click();
    await expect(page.getByText('Предложение AI')).toBeVisible();
  } else if (screen === 'rules') {
    await seedTasks(
      page,
      [],
      [
        {
          kind: 'taskType.create',
          taskType: { id: 'type-course', name: 'Курсовая' },
        },
      ],
    );
    await openView(page, 'Правила');
    await chooseFile(
      app,
      tempFile(
        'r.json',
        ruleDocument('r-study', 'Учебные проекты', ['type-course']),
      ),
    );
    await page.getByRole('button', { name: 'Импортировать файл' }).click();
    await page
      .getByRole('button', { name: 'Активировать: Учебные проекты' })
      .click();
    await chooseFile(
      app,
      tempFile('f.json', ruleDocument('r-free', 'Личные проекты', [])),
    );
    await page.getByRole('button', { name: 'Импортировать файл' }).click();
    await expect(
      page.getByRole('note', { name: /Нет привязки/ }),
    ).toBeVisible();
  } else if (screen === 'schedule') {
    await seedTasks(page, [{ id: 'a', title: 'Курсовая', day: TODAY_DAY }]);
    await chooseFile(
      app,
      tempFile('s.ics', calendar('20261005T143000Z', '20261005T160000Z')),
    );
    await page.getByRole('button', { name: 'Настройки' }).click();
    await page
      .getByRole('button', { name: 'Импортировать расписание (.ics)' })
      .click();
    await page.getByRole('button', { name: /Загрузить \d+ событий/ }).click();
    await expect(page.getByText(/Загружено событий/)).toBeVisible();
    await openView(page, 'Сегодня');
    await expect(
      page.getByRole('region', { name: 'Расписание' }),
    ).toContainText('Математика');
  } else {
    await seedTasks(page, [{ id: 'a', title: 'Курсовая', day: TODAY_DAY }]);
    await setAiMode(page, 'confirm');
    await page
      .getByRole('button', { name: 'Перестроить', exact: true })
      .click();
    await expect(page.getByRole('table', { name: 'До и после' })).toBeVisible();
    if (screen === 'stale') {
      await page.keyboard.press('ControlOrMeta+K');
      await page.getByLabel('Что нужно сделать?').fill('Новая задача');
      await page.getByLabel('Что нужно сделать?').press('Enter');
      await expect(
        page.getByText(/Данные изменились после подготовки/),
      ).toBeVisible();
    }
  }
  return started;
}

const NAMES: Record<Screen, string> = {
  chat: 'chat',
  rules: 'rules',
  schedule: 'schedule',
  replan: 'replan',
  stale: 'replan-stale',
};

for (const screen of Object.keys(NAMES) as Screen[]) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`release 2 ${NAMES[screen]} looks right in ${theme} at ${width.toString()}px`, async () => {
        const started = await prepare(screen);
        await started.page.emulateMedia({ colorScheme: theme });
        await resize(width);
        await started.page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement)
            document.activeElement.blur();
        });
        await expect(started.page).toHaveScreenshot(
          `r2-${NAMES[screen]}-${theme}-${width.toString()}.png`,
        );
      });
    }
  }
}
