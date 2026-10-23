import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { removeSmokeProfile, todayLabelAt } from './smoke-fixtures';

const packagedBinary = path.resolve(
  __dirname,
  `../../out/flowpilot-darwin-${process.arch}/flowpilot.app/Contents/MacOS/flowpilot`,
);
const roots: string[] = [];

function freshDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'flowpilot-packaged-'));
  roots.push(directory);
  return directory;
}

async function launchPackaged(
  userData: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  expect(
    existsSync(packagedBinary),
    `Packaged app not found at ${packagedBinary}. Run npm run package first.`,
  ).toBe(true);
  const app = await electron.launch({
    executablePath: packagedBinary,
    args: [`--user-data-dir=${userData}`],
    env: Object.fromEntries(
      Object.entries({ ...process.env, ...extraEnv }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.hide();
    });
  });
  return { app, page };
}

test.afterEach(() => {
  for (const root of roots.splice(0)) removeSmokeProfile(root);
});

test('the packaged app starts, loads its native storage and keeps data between launches', async () => {
  const userData = freshDirectory();
  const first = await launchPackaged(userData);
  try {
    await expect(first.page.getByRole('heading', { level: 1 })).toBeVisible();
    await first.page.getByRole('button', { name: 'Задача' }).click();
    await first.page
      .getByLabel('Что нужно сделать?')
      .fill('Упакованная задача');
    await first.page.getByLabel('Что нужно сделать?').press('Enter');
    await expect(
      first.page.getByRole('heading', { name: 'Упакованная задача', level: 3 }),
    ).toBeVisible();
  } finally {
    await first.app.close();
  }
  const second = await launchPackaged(userData);
  try {
    await expect(
      second.page.getByRole('heading', {
        name: 'Упакованная задача',
        level: 3,
      }),
    ).toBeVisible();
  } finally {
    await second.app.close();
  }
});

test('the packaged app ignores the FLOWPILOT_TEST environment variables', async () => {
  const userData = freshDirectory();
  const decoyProfile = freshDirectory();
  const { app, page } = await launchPackaged(userData, {
    FLOWPILOT_TEST: '1',
    FLOWPILOT_TEST_NOW: '2000-01-01T12:00:00Z',
    FLOWPILOT_TEST_PROFILE: decoyProfile,
  });
  try {
    await expect(
      page.getByRole('heading', {
        name: todayLabelAt(new Date().toISOString()),
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Задача' }).click();
    await page.getByLabel('Что нужно сделать?').fill('Проверка профиля');
    await page.getByLabel('Что нужно сделать?').press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Проверка профиля', level: 3 }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
  expect(readdirSync(decoyProfile)).toEqual([]);
});

test('the packaged CSP has no localhost, websocket or inline script sources', async () => {
  const { app, page } = await launchPackaged(freshDirectory());
  try {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const policy = await page.evaluate(
      () =>
        document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content') ?? '',
    );
    expect(policy).not.toBe('');
    expect(policy).not.toContain('localhost');
    expect(policy).not.toContain('ws:');
    const scriptSource = /script-src ([^;]*)/.exec(policy)?.[1] ?? '';
    expect(scriptSource).not.toContain('unsafe-inline');
    expect(scriptSource).not.toContain('unsafe-eval');
  } finally {
    await app.close();
  }
});
