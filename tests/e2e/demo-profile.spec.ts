import { expect, test } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { launchSmokeApp, removeSmokeProfile } from './smoke-fixtures';

const seedScript = path.resolve(__dirname, '../../scripts/seed-demo.mjs');
const DEMO_NOW = '2026-10-05T12:00:00Z';
const roots: string[] = [];

function seedInto(profilePath: string): void {
  execFileSync('node', [seedScript, profilePath], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'pipe',
  });
}

function freshPath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'flowpilot-demo-test-'));
  roots.push(root);
  return path.join(root, 'profile');
}

test.afterEach(() => {
  for (const root of roots.splice(0)) removeSmokeProfile(root);
});

test('seed:demo builds a profile that opens with the expected AC data', async () => {
  const profilePath = freshPath();
  seedInto(profilePath);
  const { app, page } = await launchSmokeApp(profilePath, DEMO_NOW);
  try {
    await page.getByRole('button', { name: 'Все задачи' }).click();
    const list = page.getByRole('main');
    await expect(list).toContainText('Риск не успеть');
    await expect(list).toContainText('Срок есть, объём неизвестен');
    await expect(list).toContainText('Срок прошёл');
    await expect(list).toContainText('Жду ответа преподавателя');
    const snapshot = await page.evaluate(async () => {
      const result = await window.flowpilot.snapshot.load();
      return result.ok
        ? {
            tasks: result.value.tasks.length,
            series: result.value.series.length,
            outcomes: result.value.outcomes.length,
          }
        : undefined;
    });
    expect(snapshot).toEqual({ tasks: 9, series: 2, outcomes: 9 });
    await page
      .getByRole('navigation', { name: 'Представления' })
      .getByRole('button', { name: 'Сегодня' })
      .click();
    await expect(page.getByRole('region', { name: 'Пропуски' })).toContainText(
      'Тренировка ×3',
    );
    await expect(
      page.getByRole('heading', { name: 'Дописать введение к докладу' }),
    ).toBeVisible();
    await expect(page.getByText('Перенесено со вчера').first()).toBeVisible();
  } finally {
    await app.close();
  }
});

test('seeding twice into the same path gives the same clean profile', async () => {
  const profilePath = freshPath();
  seedInto(profilePath);
  seedInto(profilePath);
  const { app, page } = await launchSmokeApp(profilePath, DEMO_NOW);
  try {
    const snapshot = await page.evaluate(async () => {
      const result = await window.flowpilot.snapshot.load();
      return result.ok
        ? { tasks: result.value.tasks.length, revision: result.value.revision }
        : undefined;
    });
    expect(snapshot).toEqual({ tasks: 9, revision: 1 });
  } finally {
    await app.close();
  }
});

test('seed:demo refuses a path among the real app data', () => {
  const real = path.join(
    homedir(),
    'Library',
    'Application Support',
    `flowpilot-demo-guard-${process.pid.toString()}`,
  );
  const result = spawnSync('node', [seedScript, real], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Отказ');
  expect(existsSync(real)).toBe(false);
});
