import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
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

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, TEST_NOW));
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('the schedule bridge lists nothing at first, previews an .ics file and stores it only after confirmation', async () => {
  const empty = await page.evaluate(() => window.flowpilot.schedule.list());
  expect(empty).toEqual({ ok: true, value: [] });

  const file = path.resolve(__dirname, '../fixtures/ics/schedule.ics');
  await app?.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showOpenDialog: () =>
        Promise.resolve({ canceled: false, filePaths: [selected] }),
    });
  }, file);

  const preview = await page.evaluate(() =>
    window.flowpilot.schedule.importFile(),
  );
  expect(preview.ok).toBe(true);
  if (!preview.ok) return;
  expect(preview.value.found).toBeGreaterThan(0);
  const stillEmpty = await page.evaluate(() =>
    window.flowpilot.schedule.list(),
  );
  expect(stillEmpty).toEqual({ ok: true, value: [] });

  const confirmed = await page.evaluate(
    (token) => window.flowpilot.schedule.confirmImport({ token }),
    preview.value.token,
  );
  expect(confirmed.ok).toBe(true);
  const listed = await page.evaluate(() => window.flowpilot.schedule.list());
  expect(listed.ok && listed.value[0]?.source).toBe('ics');
  expect(listed.ok && listed.value[0]?.events.length).toBe(preview.value.found);
});
