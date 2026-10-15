import { _electron as electron, expect } from '@playwright/test';
import type {
  BrowserContext,
  ElectronApplication,
  Page,
} from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Temporal } from 'temporal-polyfill';

const DEFAULT_TEST_NOW = '2026-10-05T12:00:00Z';
const SNAPSHOT_NOW = '2026-10-05T12:00:00Z';
export const TEST_NOW = process.env.FLOWPILOT_TEST_NOW ?? DEFAULT_TEST_NOW;
export const SNAPSHOT_NOW_INSTANT = SNAPSHOT_NOW;
export const TODAY = localDateAt(TEST_NOW).toString();
const SNAPSHOT_DATE = localDateAt(SNAPSHOT_NOW);
export const SNAPSHOT_DAY = SNAPSHOT_DATE.toString();
export const SNAPSHOT_DEADLINE = SNAPSHOT_DATE.add({ days: 4 }).toString();
export const SNAPSHOT_WINDOW = {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
} as const;

export function localDateAt(instant: string): Temporal.PlainDate {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate();
}

export function todayLabelAt(instant: string): string {
  const date = localDateAt(instant);
  return `Сегодня, ${date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })}`;
}

export function createSmokeProfile(): string {
  return mkdtempSync(path.join(tmpdir(), 'flowpilot-e2e-'));
}

export function removeSmokeProfile(profilePath: string): void {
  rmSync(profilePath, { recursive: true, force: true });
}

export async function launchSmokeApp(
  profilePath: string,
  now: string,
  verifyDate = true,
  beforeWindowLoad?: (context: BrowserContext) => Promise<void>,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [
      path.resolve(__dirname, '../..'),
      `--force-device-scale-factor=${String(SNAPSHOT_WINDOW.deviceScaleFactor)}`,
      '--hide-scrollbars',
    ],
    env: {
      ...process.env,
      FLOWPILOT_E2E: '1',
      FLOWPILOT_TEST: '1',
      FLOWPILOT_TEST_NOW: now,
      FLOWPILOT_TEST_PROFILE: profilePath,
    },
  });
  if (beforeWindowLoad) await beforeWindowLoad(app.context());
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, SNAPSHOT_WINDOW);
  await page.setViewportSize({
    width: SNAPSHOT_WINDOW.width,
    height: SNAPSHOT_WINDOW.height,
  });
  const windowState = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return { visible: window?.isVisible(), focused: window?.isFocused() };
  });
  expect(windowState).toEqual({ visible: false, focused: false });
  if (verifyDate) {
    await expect(
      page.getByRole('heading', { name: todayLabelAt(now), exact: true }),
    ).toBeVisible();
  }
  return { app, page };
}
