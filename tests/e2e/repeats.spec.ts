import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  SNAPSHOT_NOW_INSTANT,
} from './smoke-fixtures';

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  ({ app, page } = await launchSmokeApp(profilePath, SNAPSHOT_NOW_INSTANT));
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});

for (const width of [900, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`matches ${theme} repeat screen at ${width.toString()}px`, async () => {
      await page.setViewportSize({ width, height: 800 });
      const result = await page.evaluate(async (selectedTheme) => {
        const created = await window.flowpilot.commands.apply({
          expectedRevision: 0,
          commands: [
            {
              kind: 'series.create',
              series: {
                id: 'repeat-snapshot',
                title: 'Тренировка на выносливость',
                weekdays: [1],
                time: '18:00',
                startsOn: '2026-09-28',
              },
            },
            {
              kind: 'series.recordOutcome',
              seriesId: 'repeat-snapshot',
              outcome: { kind: 'skipped', date: '2026-09-28' },
            },
          ],
        });
        const appearance = await window.flowpilot.appearance.setTheme({
          theme: selectedTheme,
        });
        return created.ok && appearance.ok;
      }, theme);
      expect(result).toBe(true);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Повторы сегодня' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Тренировка на выносливость ×1' }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        window.getSelection()?.removeAllRanges();
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      await expect(page).toHaveScreenshot(
        `repeats-${theme}-${width.toString()}.png`,
        {
          fullPage: true,
          maxDiffPixelRatio: 0.00001,
        },
      );
    });
  }
}
test('wraps long repeat titles without losing their accessible name', async () => {
  await page.setViewportSize({ width: 900, height: 800 });
  const title =
    'Подготовить подробный план регулярной утренней тренировки на выносливость';
  const created = await page.evaluate(async (seriesTitle) => {
    const result = await window.flowpilot.commands.apply({
      expectedRevision: 0,
      commands: [
        {
          kind: 'series.create',
          series: {
            id: 'long-repeat-title',
            title: seriesTitle,
            weekdays: [1],
            startsOn: '2026-09-28',
          },
        },
      ],
    });
    return result.ok;
  }, title);
  expect(created).toBe(true);
  await page.reload();
  const titleButton = page.getByRole('button', { name: title, exact: true });
  await expect(titleButton).toBeVisible();
  await expect
    .poll(() =>
      titleButton.evaluate((button) => getComputedStyle(button).overflowWrap),
    )
    .toBe('anywhere');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
