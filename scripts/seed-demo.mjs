/* global window -- these callbacks run inside the Electron renderer */
import { _electron as electron } from '@playwright/test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

/** The one scripted answer of the fake AI in the demo: "what now?" points at the first task. */
export const DEMO_AI_REPLY = {
  action: { taskId: 'demo-risk-tight' },
  reason: 'Срок в пятницу, а работы ещё около пяти дней: запас почти исчерпан.',
};

const DEMO_CALENDAR = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:demo-math-1
SUMMARY:Математика
LOCATION:аудитория 204
DTSTART:20261005T143000Z
DTEND:20261005T160000Z
END:VEVENT
BEGIN:VEVENT
UID:demo-design-1
SUMMARY:Проектирование
LOCATION:аудитория 308
DTSTART:20261005T161500Z
DTEND:20261005T174500Z
END:VEVENT
BEGIN:VEVENT
UID:demo-math-2
SUMMARY:Математика
LOCATION:аудитория 204
DTSTART:20261007T143000Z
DTEND:20261007T160000Z
END:VEVENT
END:VCALENDAR
`;

function ruleJson(id, title, typeIds, reason) {
  return JSON.stringify({
    schema_version: 'v1',
    id,
    title,
    scope: { task_type_ids: typeIds },
    rules: [{ id: `${id}-priority`, kind: 'priority', level: 'high', reason }],
    guidance: 'Учебный пример: начинать большие работы заранее.',
  });
}

/** Release 2 data: catalog, bound tasks, rules, a schedule. Fictional, like the rest. */
export function catalogCommands() {
  return [
    {
      kind: 'taskType.create',
      taskType: { id: 'demo-type-course', name: 'Курсовая' },
    },
    {
      kind: 'taskType.create',
      taskType: { id: 'demo-type-lab', name: 'Лабораторная' },
    },
    {
      kind: 'discipline.create',
      discipline: {
        id: 'demo-disc-design',
        name: 'Проектирование',
        color: 'study',
      },
    },
    {
      kind: 'discipline.create',
      discipline: { id: 'demo-disc-physics', name: 'Физика', color: 'study' },
    },
  ];
}

export function classifyCommands() {
  return [
    {
      kind: 'task.classify',
      taskId: 'demo-risk-tight',
      typeId: 'demo-type-course',
      disciplineId: 'demo-disc-design',
    },
    {
      kind: 'task.classify',
      taskId: 'demo-risk-short',
      typeId: 'demo-type-lab',
      disciplineId: 'demo-disc-physics',
    },
  ];
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
    await seedRelease2(app, page);
  } finally {
    await app.close();
  }
}

async function chooseFile(app, file) {
  await app.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showOpenDialog: () =>
        Promise.resolve({ canceled: false, filePaths: [selected] }),
    });
  }, file);
}

function writeTemp(directory, name, content) {
  const file = join(directory, name);
  writeFileSync(file, content);
  return file;
}

async function applyCommands(page, commands) {
  const result = await page.evaluate(async (list) => {
    const snapshot = await window.flowpilot.snapshot.load();
    if (!snapshot.ok) return { ok: false };
    return window.flowpilot.commands.apply({
      expectedRevision: snapshot.value.revision,
      commands: list,
    });
  }, commands);
  if (!result.ok)
    throw new Error(`Demo seeding failed: ${JSON.stringify(result)}`);
}

async function seedRelease2(app, page) {
  await applyCommands(page, catalogCommands());
  await applyCommands(page, classifyCommands());
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-demo-files-'));
  try {
    for (const [id, title, types, reason] of [
      [
        'demo-rule-study',
        'Учебные проекты',
        ['demo-type-course'],
        'Крупные учебные работы важнее обычной практики.',
      ],
      [
        'demo-rule-personal',
        'Личные проекты',
        [],
        'Личные дела без жёсткого срока.',
      ],
    ]) {
      await chooseFile(
        app,
        writeTemp(directory, `${id}.json`, ruleJson(id, title, types, reason)),
      );
      const imported = await page.evaluate(() =>
        window.flowpilot.rules.importFile(),
      );
      if (!imported.ok)
        throw new Error(`Demo rule import failed: ${JSON.stringify(imported)}`);
    }
    const activated = await page.evaluate(() =>
      window.flowpilot.rules.activate({ id: 'demo-rule-study' }),
    );
    if (!activated.ok)
      throw new Error(
        `Demo rule activation failed: ${JSON.stringify(activated)}`,
      );
    await chooseFile(app, writeTemp(directory, 'demo.ics', DEMO_CALENDAR));
    const preview = await page.evaluate(() =>
      window.flowpilot.schedule.importFile(),
    );
    if (!preview.ok)
      throw new Error(`Demo schedule failed: ${JSON.stringify(preview)}`);
    const confirmed = await page.evaluate(
      (token) => window.flowpilot.schedule.confirmImport({ token }),
      preview.value.token,
    );
    if (!confirmed.ok)
      throw new Error(`Demo schedule failed: ${JSON.stringify(confirmed)}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
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
    `FLOWPILOT_TEST=1 FLOWPILOT_TEST_PROFILE='${profilePath}' FLOWPILOT_TEST_NOW='${DEMO_NOW}' FLOWPILOT_TEST_AI_REPLY='${JSON.stringify(DEMO_AI_REPLY)}' npm start`,
  );
  console.log(
    'Фейковый AI в демо отвечает один раз («Что делать сейчас?»), дальше сообщает, что недоступен.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
