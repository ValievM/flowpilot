import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  TEST_NOW,
} from './smoke-fixtures';

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

async function open(env: Record<string, string> = {}): Promise<void> {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(
    profilePath,
    TEST_NOW,
    true,
    undefined,
    env,
  ));
  await page.getByRole('button', { name: 'Настройки' }).click();
}

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

test('the AI block shows manual exchange by default and says Codex is missing', async () => {
  await open();
  await expect(
    page.getByRole('heading', { name: 'AI', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: /Ручной обмен/ })).toBeChecked();
  await expect(
    page.getByRole('note').filter({ hasText: /Codex/ }),
  ).toBeVisible();
  await expect(page.getByText(/только по вашему нажатию/)).toBeVisible();
});

test('with Codex ready the choice can be switched, and switching asks nothing', async () => {
  await open({ FLOWPILOT_TEST_CODEX: 'ready' });
  const calls = async (): Promise<number> =>
    (await app?.evaluate(
      () =>
        (globalThis as { __FLOWPILOT_TEST_AI_CALLS__?: unknown[] })
          .__FLOWPILOT_TEST_AI_CALLS__?.length ?? -1,
    )) ?? -1;
  const codex = page.getByRole('radio', { name: /Codex/ });
  if (await codex.isEnabled()) {
    await codex.click();
    await expect(codex).toBeChecked();
    await page.getByRole('radio', { name: /Ручной обмен/ }).click();
    await expect(
      page.getByRole('radio', { name: /Ручной обмен/ }),
    ).toBeChecked();
  }
  expect(await calls()).toBe(0);
});
