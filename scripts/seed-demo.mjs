/* global window -- these callbacks run inside the Electron renderer */
import { _electron as electron } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import console from 'node:console';

export const DEMO_NOW = '2026-10-05T12:00:00Z';

/** Real app data lives under ~/Library/Application Support; never seed there. */
export function isRealProfilePath(candidate) {
  const target = resolve(candidate);
  const root = resolve(homedir(), 'Library', 'Application Support');
  const inside = relative(root, target);
  return inside === '' || (!inside.startsWith('..') && !inside.startsWith(sep));
}

function task(id, title, extra) {
  return {
    kind: 'task.create',
    task: {
      id,
      title,
      status: { kind: 'todo' },
      columnId: 'todo',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
      ...extra,
    },
  };
}

/** Fictional data: AC-09 rows 2, 4, 10, 12; AC-03; AC-04; AC-05; AC-01. */
export function demoCommands(columns) {
  const column = (state) => columns.find((item) => item.state === state)?.id;
  const waiting = column('waiting');
  const doing = column('doing');
  const done = column('done');
  const today = '2026-10-05';
  return [
    task('demo-risk-tight', 'Курсовая: собрать рабочий прототип', {
      day: today,
      deadline: '2026-10-09',
      estimate: { unit: 'workdays', value: 5 },
      description: 'Собрать минимальный прототип каталога книг.',
      subtasks: [
        {
          id: 'demo-sub-1',
          title: 'Выбрать структуру данных',
          completed: true,
        },
        {
          id: 'demo-sub-2',
          title: 'Собрать поиск и карточку',
          completed: false,
        },
      ],
      comments: [{ id: 'demo-comment-1', text: 'Структура готова.' }],
      addedOrder: 1,
    }),
    task('demo-risk-short', 'Сдать лабораторную по физике', {
      day: today,
      deadline: '2026-10-06',
      estimate: { unit: 'workdays', value: 4 },
      addedOrder: 2,
    }),
    task('demo-risk-unknown', 'Разобрать конспекты за месяц', {
      day: today,
      deadline: '2026-10-09',
      addedOrder: 3,
    }),
    task('demo-risk-overdue', 'Продлить доступ к библиотеке', {
      day: today,
      deadline: '2026-10-02',
      addedOrder: 4,
    }),
    task('demo-yesterday', 'Дописать введение к докладу', {
      day: '2026-10-04',
      columnId: doing,
      status: { kind: 'doing' },
      subtasks: [
        { id: 'demo-sub-3', title: 'Набросать план', completed: true },
        { id: 'demo-sub-4', title: 'Вычитать текст', completed: false },
      ],
      comments: [{ id: 'demo-comment-2', text: 'Осталось вычитать.' }],
      addedOrder: 5,
    }),
    task('demo-waiting', 'Уточнить тему доклада', {
      day: today,
      columnId: waiting,
      status: { kind: 'waiting', reason: 'Жду ответа преподавателя' },
      addedOrder: 6,
    }),
    task('demo-future', 'Подготовиться к семинару', {
      day: '2026-10-12',
      addedOrder: 7,
    }),
    task('demo-no-day', 'Разобрать заметки без назначенного дня', {
      addedOrder: 8,
    }),
    task('demo-done', 'Отправить конспект семинара', {
      day: today,
      columnId: done,
      status: { kind: 'done' },
      addedOrder: 9,
    }),
    {
      kind: 'series.create',
      series: {
        id: 'demo-series-training',
        title: 'Тренировка',
        weekdays: [1, 3, 5],
        time: '18:00',
        startsOn: '2026-09-14',
      },
    },
    {
      kind: 'series.create',
      series: {
        id: 'demo-series-reading',
        title: 'Чтение 20 минут',
        weekdays: [1, 2, 3, 4, 5],
        startsOn: today,
      },
    },
    ...[
      ['done', '2026-09-14'],
      ['skipped', '2026-09-16'],
      ['done', '2026-09-18'],
      ['skipped', '2026-09-21'],
      ['done', '2026-09-23'],
      ['done', '2026-09-25'],
      ['skipped', '2026-09-28'],
      ['done', '2026-09-30'],
      ['done', '2026-10-02'],
    ].map(([kind, date]) => ({
      kind: 'series.recordOutcome',
      seriesId: 'demo-series-training',
      outcome: { kind, date },
    })),
  ];
}

async function seed(profilePath) {
  const app = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      FLOWPILOT_E2E: '1',
      FLOWPILOT_TEST: '1',
      FLOWPILOT_TEST_NOW: DEMO_NOW,
      FLOWPILOT_TEST_PROFILE: profilePath,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.flowpilot));
    const loaded = await page.evaluate(async () => {
      const result = await window.flowpilot.snapshot.load();
      return result.ok
        ? {
            ok: true,
            revision: result.value.revision,
            columns: result.value.columns,
          }
        : { ok: false };
    });
    if (!loaded.ok)
      throw new Error('Demo seeding failed: snapshot did not load');
    const applied = await page.evaluate(
      async (request) => window.flowpilot.commands.apply(request),
      {
        expectedRevision: loaded.revision,
        commands: demoCommands(loaded.columns),
      },
    );
    if (!applied.ok)
      throw new Error(`Demo seeding failed: ${JSON.stringify(applied)}`);
  } finally {
    await app.close();
  }
}

async function main() {
  const requested = process.argv[2];
  if (requested && isRealProfilePath(requested)) {
    console.error(
      `Отказ: ${requested} лежит среди данных настоящего приложения. Демо-профиль нельзя создавать там.`,
    );
    process.exitCode = 2;
    return;
  }
  const profilePath = requested
    ? resolve(requested)
    : mkdtempSync(join(tmpdir(), 'flowpilot-demo-'));
  if (existsSync(profilePath))
    rmSync(profilePath, { recursive: true, force: true });
  mkdirSync(profilePath, { recursive: true });
  await seed(profilePath);
  console.log(`Демо-профиль готов: ${profilePath}`);
  console.log('Запуск приложения с этим профилем:');
  console.log(
    `FLOWPILOT_TEST=1 FLOWPILOT_TEST_PROFILE='${profilePath}' FLOWPILOT_TEST_NOW='${DEMO_NOW}' npm start`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
