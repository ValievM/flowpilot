import { expect } from '@playwright/test';
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

export interface Session {
  app: ElectronApplication;
  page: Page;
  profile: string;
}

export async function startSession(
  reply?: unknown,
  now: string = TEST_NOW,
): Promise<Session> {
  const profile = createSmokeProfile();
  const extra =
    reply === undefined
      ? {}
      : { FLOWPILOT_TEST_AI_REPLY: JSON.stringify(reply) };
  const launched = await launchSmokeApp(profile, now, true, undefined, extra);
  return { ...launched, profile };
}

export async function stopSession(session: Session | undefined): Promise<void> {
  if (!session) return;
  await session.app.close();
  removeSmokeProfile(session.profile);
}

export async function openView(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Представления' })
    .getByRole('button', { name })
    .click();
}

export function tempFile(name: string, content: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'flowpilot-r2-'));
  const file = path.join(directory, name);
  writeFileSync(file, content);
  return file;
}

export async function chooseFile(
  app: ElectronApplication,
  file: string,
): Promise<void> {
  await app.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showOpenDialog: () =>
        Promise.resolve({ canceled: false, filePaths: [selected] }),
    });
  }, file);
}

export interface SeedTask {
  id: string;
  title: string;
  day?: string;
}

export async function seedTasks(
  page: Page,
  tasks: SeedTask[],
  extra: unknown[] = [],
): Promise<void> {
  const seeded = await page.evaluate(
    async ({ items, more }) => {
      const result = await window.flowpilot.commands.apply({
        expectedRevision: 0,
        commands: [
          ...items.map((task, index) => ({
            kind: 'task.create' as const,
            task: {
              id: task.id,
              title: task.title,
              status: { kind: 'todo' as const },
              columnId: 'todo',
              ...(task.day ? { day: task.day } : {}),
              subtasks: [],
              comments: [],
              attachments: [],
              addedOrder: index + 1,
            },
          })),
          ...(more as never[]),
        ],
      });
      return result.ok;
    },
    { items: tasks, more: extra },
  );
  expect(seeded).toBe(true);
  await page.reload();
}

export async function taskField(
  page: Page,
  id: string,
  field: 'day' | 'title' | 'description' | 'deadline',
): Promise<string | undefined> {
  return page.evaluate(
    async ({ taskId, key }) => {
      const result = await window.flowpilot.snapshot.load();
      const task = result.ok
        ? result.value.tasks.find((item) => item.id === taskId)
        : undefined;
      return task
        ? (task as unknown as Record<string, string | undefined>)[key]
        : undefined;
    },
    { taskId: id, key: field },
  );
}

export async function taskCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const result = await window.flowpilot.snapshot.load();
    return result.ok ? result.value.tasks.length : -1;
  });
}

export async function setAiMode(
  page: Page,
  mode: 'auto' | 'confirm',
): Promise<void> {
  const ok = await page.evaluate(async (value) => {
    const snapshot = await window.flowpilot.snapshot.load();
    if (!snapshot.ok) return false;
    const result = await window.flowpilot.commands.apply({
      expectedRevision: snapshot.value.revision,
      commands: [{ kind: 'setting.set', key: 'aiMode', value }],
    });
    return result.ok;
  }, mode);
  expect(ok).toBe(true);
  await page.reload();
}

export function calendar(startUtc: string, endUtc: string): string {
  return `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:math-1
SUMMARY:Математика
LOCATION:ауд. 204
DTSTART:${startUtc}
DTEND:${endUtc}
END:VEVENT
BEGIN:VEVENT
UID:design-1
SUMMARY:Проектирование
DTSTART:20261005T161500Z
DTEND:20261005T174500Z
END:VEVENT
END:VCALENDAR
`;
}

export function ruleDocument(
  id: string,
  title: string,
  typeIds: string[],
  level: 'high' | 'low' = 'high',
): string {
  return JSON.stringify({
    schema_version: 'v1',
    id,
    title,
    scope: { task_type_ids: typeIds },
    rules: [{ id: 'p1', kind: 'priority', level, reason: 'Важно' }],
  });
}

export const TODAY_DAY = '2026-10-05';
