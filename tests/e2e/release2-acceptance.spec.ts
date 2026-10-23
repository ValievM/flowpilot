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
  taskCount,
  taskField,
  tempFile,
  TODAY_DAY,
  type Session,
} from './release2-fixtures';

// Release 2 acceptance on the fake AI provider, rules and schedule from files.
let session: Session | undefined;

test.afterEach(async () => {
  await stopSession(session);
  session = undefined;
});

const REPLAN = {
  commands: [{ kind: 'task.update', id: 'a', changes: { day: '2026-10-06' } }],
  rationale: 'Курсовая требует несколько дней.',
};

test('AC-02 chat: a text becomes a card with what is known, the unknown stays empty, a repeat adds no copy', async () => {
  session = await startSession({
    cards: [
      {
        title: 'Подготовить доклад',
        day: '2026-10-09',
        subtasks: [{ title: 'Собрать источники' }],
      },
    ],
    unknowns: ['Нужна ли презентация?'],
  });
  const { page } = session;
  await openView(page, 'Чат с AI');
  await page
    .getByLabel('Сообщение помощнику')
    .fill('Подготовить доклад к пятнице');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Изменения применены.')).toBeVisible();
  expect(await taskCount(page)).toBe(1);
  expect(
    await taskField(page, await firstTaskId(page), 'description'),
  ).toBeUndefined();
  expect(
    await taskField(page, await firstTaskId(page), 'deadline'),
  ).toBeUndefined();

  await page
    .getByLabel('Сообщение помощнику')
    .fill('Подготовить доклад к пятнице');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect(await taskCount(page)).toBe(1);
});

async function firstTaskId(page: Session['page']): Promise<string> {
  return page.evaluate(async () => {
    const result = await window.flowpilot.snapshot.load();
    return result.ok ? (result.value.tasks[0]?.id ?? '') : '';
  });
}

test('AC-06 what now: an available task with a reason, and no questions about budget or duration', async () => {
  session = await startSession({
    action: { taskId: 'a' },
    reason: 'Срок в пятницу, работы много.',
  });
  const { page } = session;
  await seedTasks(page, [{ id: 'a', title: 'Курсовая', day: TODAY_DAY }]);
  await openView(page, 'Сейчас');
  await page.getByRole('button', { name: 'Что делать сейчас?' }).click();
  const card = page.getByRole('article', { name: 'Совет AI' });
  await expect(card).toContainText('Курсовая');
  await card.getByRole('button', { name: 'Почему' }).click();
  await expect(card).toContainText('Срок в пятницу');
  await expect(page.locator('body')).not.toContainText(/бюджет|длительност/i);
});

test('AC-06 what now: with nothing available the answer is honest and assigns nothing', async () => {
  session = await startSession({
    action: null,
    reason: 'Все дела назначены на будущее.',
  });
  const { page } = session;
  await seedTasks(page, [{ id: 'a', title: 'Курсовая', day: '2026-10-20' }]);
  await openView(page, 'Сейчас');
  await page.getByRole('button', { name: 'Что делать сейчас?' }).click();
  const card = page.getByRole('article', { name: 'Совет AI' });
  await expect(card).toContainText('Все дела назначены на будущее.');
  await expect(card.getByRole('button', { name: 'Начать' })).toHaveCount(0);
});

test('AC-07 confirm mode: the order stays until confirmed, a refusal changes nothing', async () => {
  session = await startSession(REPLAN);
  const { page } = session;
  await seedTasks(page, [{ id: 'a', title: 'Курсовая', day: TODAY_DAY }]);
  await setAiMode(page, 'confirm');
  await page.getByRole('button', { name: 'Перестроить', exact: true }).click();
  await expect(page.getByRole('table', { name: 'До и после' })).toBeVisible();
  expect(await taskField(page, 'a', 'day')).toBe(TODAY_DAY);
  await page.getByRole('button', { name: 'Оставить текущий порядок' }).click();
  await expect(page.getByText('Порядок не изменён.')).toBeVisible();
  expect(await taskField(page, 'a', 'day')).toBe(TODAY_DAY);
});

test('AC-07 auto mode applies at once, and AC-12 the batch is in the history and can be undone', async () => {
  session = await startSession(REPLAN);
  const { page } = session;
  await seedTasks(page, [{ id: 'a', title: 'Курсовая', day: TODAY_DAY }]);
  await setAiMode(page, 'auto');
  await page.getByRole('button', { name: 'Перестроить', exact: true }).click();
  await expect(page.getByText('Порядок перестроен.')).toBeVisible();
  expect(await taskField(page, 'a', 'day')).toBe('2026-10-06');
  await page.getByRole('button', { name: 'История' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .locator('.replan-card')
    .getByRole('button', { name: 'Отменить' })
    .click();
  await expect(page.getByText('Изменения отменены.')).toBeVisible();
  expect(await taskField(page, 'a', 'day')).toBe(TODAY_DAY);
});

test('AC-07 a proposal built before a manual edit cannot be applied', async () => {
  session = await startSession(REPLAN);
  const { page } = session;
  await seedTasks(page, [{ id: 'a', title: 'Курсовая', day: TODAY_DAY }]);
  await setAiMode(page, 'confirm');
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
  expect(await taskField(page, 'a', 'day')).toBe(TODAY_DAY);
});

test('AC-12 an unavailable AI does not get in the way of manual work', async () => {
  session = await startSession();
  const { page } = session;
  await openView(page, 'Чат с AI');
  await page.getByLabel('Сообщение помощнику').fill('Подготовить доклад');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('alert').first()).toContainText(
    'AI сейчас недоступен',
  );
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByLabel('Что нужно сделать?').fill('Ручная задача');
  await page.getByLabel('Что нужно сделать?').press('Enter');
  await expect.poll(() => taskCount(page)).toBe(1);
});

test('AC-08 rules: a valid file is a draft, a typo shows the field path and keeps the active version, an unbound document is flagged', async () => {
  session = await startSession();
  const { app, page } = session;
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
  const card = page.getByRole('article', { name: 'Учебные проекты' });
  await expect(card).toContainText('Черновик');
  await page
    .getByRole('button', { name: 'Активировать: Учебные проекты' })
    .click();
  await expect(card).toContainText('Активно');

  await chooseFile(
    app,
    tempFile(
      'typo.json',
      ruleDocument('r-study', 'Учебные проекты', ['labs-old']),
    ),
  );
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  await expect(page.getByRole('alert')).toContainText('scope.task_type_ids');
  await expect(page.getByRole('alert')).toContainText(
    'Прежняя рабочая версия осталась',
  );
  await expect(card).toContainText('Активно');

  await chooseFile(
    app,
    tempFile('free.json', ruleDocument('r-free', 'Личные проекты', [])),
  );
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  await expect(page.getByRole('note', { name: /Нет привязки/ })).toBeVisible();
});

test('AC-08 rules: a conflicting activation is refused and renaming a type keeps its binding', async () => {
  session = await startSession();
  const { app, page } = session;
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
      'a.json',
      ruleDocument('r-high', 'Важно', ['type-course'], 'high'),
    ),
  );
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  await page.getByRole('button', { name: 'Активировать: Важно' }).click();
  await expect(
    page.getByRole('article', { name: 'Важно', exact: true }),
  ).toContainText('Активно');
  await chooseFile(
    app,
    tempFile(
      'b.json',
      ruleDocument('r-low', 'Неважно', ['type-course'], 'low'),
    ),
  );
  await page.getByRole('button', { name: 'Импортировать файл' }).click();
  await page.getByRole('button', { name: 'Активировать: Неважно' }).click();
  await expect(page.getByRole('alert')).toContainText('конфликтует');
  await expect(
    page.getByRole('article', { name: 'Неважно', exact: true }),
  ).toContainText('Черновик');

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Переименовать: Курсовая' }).click();
  await page.getByLabel('Новое название').fill('Проект');
  await page.getByRole('button', { name: 'Сохранить название' }).click();
  await openView(page, 'Правила');
  await expect(
    page.getByRole('article', { name: 'Важно', exact: true }),
  ).toContainText('Проект');
});

test('AC-10 schedule: a file loads once, a repeat adds no copies, a changed time replaces the old one', async () => {
  session = await startSession();
  const { app, page } = session;
  const load = async (file: string): Promise<void> => {
    await chooseFile(app, file);
    await page.getByRole('button', { name: 'Настройки' }).click();
    await page
      .getByRole('button', { name: 'Импортировать расписание (.ics)' })
      .click();
    await page.getByRole('button', { name: /Загрузить \d+ событий/ }).click();
    await expect(page.getByText(/Загружено событий: 2/)).toBeVisible();
  };
  await load(
    tempFile('s.ics', calendar('20261005T143000Z', '20261005T160000Z')),
  );
  await expect(page.locator('.schedule-source-list')).toContainText(
    'событий: 2',
  );
  await load(
    tempFile('s.ics', calendar('20261005T143000Z', '20261005T160000Z')),
  );
  await expect(page.locator('.schedule-source-list')).toContainText(
    'событий: 2',
  );
  await load(
    tempFile('s2.ics', calendar('20261005T150000Z', '20261005T163000Z')),
  );
  await openView(page, 'Сегодня');
  const strip = page.getByRole('region', { name: 'Расписание' });
  await expect(strip).toContainText('15:00 — 16:30');
  await expect(strip).not.toContainText('14:30 — 16:00');
});
