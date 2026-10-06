import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { Temporal } from 'temporal-polyfill';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  SNAPSHOT_NOW_INSTANT,
  TEST_NOW,
  TODAY,
} from './smoke-fixtures';

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

test.beforeEach(async () => {
  const { title } = test.info();
  profilePath = createSmokeProfile();
  const now = title.startsWith('matches ') ? SNAPSHOT_NOW_INSTANT : TEST_NOW;
  ({ app, page } = await launchSmokeApp(
    profilePath,
    now,
    title !==
      'uses shifted main time for the Today header and Сейчас availability',
  ));
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('keeps the E2E window hidden without exposing Node globals', async () => {
  const windowState = await app?.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { visible: window?.isVisible(), focused: window?.isFocused() };
  });
  expect(windowState).toEqual({ visible: false, focused: false });
  await expect(page.getByText('Сохранено')).toBeVisible();
  expect(
    await page.evaluate(
      () => typeof (window as Window & { require?: unknown }).require,
    ),
  ).toBe('undefined');
  expect(
    await page.evaluate(
      () => typeof (window as Window & { process?: unknown }).process,
    ),
  ).toBe('undefined');
});

test('uses shifted main time for the Today header and Сейчас availability', async () => {
  const shiftedNow = Temporal.Instant.from(TEST_NOW)
    .add({ hours: 720 })
    .toString();
  const shiftedDate = Temporal.Instant.from(shiftedNow)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate()
    .toString();
  if (app) await app.close();
  removeSmokeProfile(profilePath);
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, shiftedNow));
  const result = await page.evaluate(
    async (day) =>
      window.flowpilot.commands.apply({
        expectedRevision: 0,
        commands: [
          {
            kind: 'task.create',
            task: {
              id: 'shifted-today',
              title: 'Дело в смещённом Сегодня',
              description: '',
              status: { kind: 'todo' },
              columnId: 'todo',
              day,
              subtasks: [],
              comments: [],
              attachments: [],
              addedOrder: 0,
            },
          },
        ],
      }),
    shiftedDate,
  );
  expect(result).toMatchObject({ ok: true });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Дело в смещённом Сегодня', level: 3 }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name: 'Сейчас' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Дело в смещённом Сегодня' }),
  ).toBeVisible();
});

test('loads an empty profile and shows the empty state in Сейчас', async () => {
  const result = await page.evaluate(() => window.flowpilot.snapshot.load());
  expect(result).toMatchObject({ ok: true, value: { tasks: [], revision: 0 } });
  await page.getByRole('button', { name: 'Сейчас' }).click();
  await expect(
    page.getByRole('heading', { name: 'Сегодня пока пусто' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Добавьте задачу — она сохранится и появится в сегодняшнем списке.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/ожидают ответа, завершены или назначены на будущее/i),
  ).toHaveCount(0);
});

test('rejects renderer attachment additions through the public IPC API', async () => {
  const result = await page.evaluate(async (today) => {
    const created = await window.flowpilot.commands.apply({
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'task-ipc',
            title: 'Plan',
            description: '',
            status: { kind: 'todo' },
            columnId: 'todo',
            day: today,
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 0,
          },
        },
      ],
      expectedRevision: 0,
    });
    if (!created.ok) return { created, attempt: null, snapshot: null };
    const attempt = await window.flowpilot.commands.apply({
      commands: [
        {
          kind: 'attachment.add',
          taskId: 'task-ipc',
          attachment: {
            id: 'attachment-ipc',
            name: 'notes.txt',
            mediaType: 'text/plain',
            sizeBytes: 12,
          },
        },
      ],
      expectedRevision: 1,
    } as unknown as Parameters<typeof window.flowpilot.commands.apply>[0]);
    return {
      created,
      attempt,
      snapshot: await window.flowpilot.snapshot.load(),
    };
  }, TODAY);
  expect(result.created).toMatchObject({ ok: true, value: { revision: 1 } });
  expect(result.attempt).toEqual({ ok: false, error: 'ValidationFailed' });
  expect(result.snapshot).toMatchObject({
    ok: true,
    value: {
      revision: 1,
      tasks: [{ id: 'task-ipc', attachments: [] }],
    },
  });
});
