import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import {
  createSmokeProfile,
  launchSmokeApp,
  removeSmokeProfile,
  SNAPSHOT_DAY,
  SNAPSHOT_DEADLINE,
  SNAPSHOT_NOW_INSTANT,
  TEST_NOW,
} from './smoke-fixtures';

let app: ElectronApplication | undefined;
let page: Page;
let profilePath: string;

test.beforeEach(async () => {
  profilePath = createSmokeProfile();
  const now = test.info().title.startsWith('matches ')
    ? SNAPSHOT_NOW_INSTANT
    : TEST_NOW;
  ({ app, page } = await launchSmokeApp(profilePath, now));
});

test.afterEach(async () => {
  if (app) await app.close();
  removeSmokeProfile(profilePath);
});
for (const width of [900, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`matches ${theme} settings snapshot at ${width.toString()}px`, async () => {
      await page.setViewportSize({ width, height: 800 });
      await page.getByRole('button', { name: 'Настройки' }).click();
      await page.getByRole('combobox', { name: 'Тема' }).selectOption(theme);
      expect(await page.evaluate(() => window.innerWidth)).toBe(width);
      await page.evaluate(() => {
        window.getSelection()?.removeAllRanges();
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const themeChoice = page.getByRole('combobox', { name: 'Тема' });
      await themeChoice.focus();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('combobox', { name: 'Уменьшить движение' }),
      ).toBeFocused();
      await expect
        .poll(() =>
          page
            .getByRole('combobox', { name: 'Уменьшить движение' })
            .evaluate((element) => getComputedStyle(element).outlineStyle),
        )
        .toBe('solid');
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      await expect
        .poll(() =>
          page.getByRole('combobox', { name: 'Тема' }).evaluate((element) => {
            const styles = getComputedStyle(element);
            return {
              height: styles.height,
              borderColor: styles.borderColor,
              appearance: styles.appearance,
              backgroundImage: styles.backgroundImage,
            };
          }),
        )
        .toMatchObject({
          height: '36px',
          appearance: 'none',
        });
      expect(
        await page
          .getByRole('checkbox', { name: 'Понедельник' })
          .evaluate((element) => {
            const reference = document.createElement('input');
            reference.type = 'checkbox';
            reference.style.accentColor = 'var(--accent)';
            document.body.append(reference);
            const matchesToken =
              getComputedStyle(element).accentColor ===
              getComputedStyle(reference).accentColor;
            reference.remove();
            return matchesToken;
          }),
      ).toBe(true);
      const fieldset = page.getByRole('group', {
        name: 'Дни недели, учитываемые при расчёте срока',
      });
      const card = page
        .getByRole('heading', { name: 'Рабочие дни' })
        .locator('..');
      const fieldsetBounds = await fieldset.boundingBox();
      const cardBounds = await card.boundingBox();
      if (!fieldsetBounds || !cardBounds)
        throw new Error('Настройка рабочих дней не отображается.');
      expect(fieldsetBounds.x).toBeGreaterThan(cardBounds.x);
      expect(fieldsetBounds.x + fieldsetBounds.width).toBeLessThan(
        cardBounds.x + cardBounds.width,
      );
      const sidebar = await page.locator('.sidebar').boundingBox();
      const content = await page.locator('.workspace').boundingBox();
      if (!sidebar || !content)
        throw new Error('Боковая панель или содержимое не отображается.');
      expect(sidebar.height).toBeGreaterThanOrEqual(content.height);
      await expect(page).toHaveScreenshot(
        `settings-${theme}-${width.toString()}.png`,
        { fullPage: true, maxDiffPixelRatio: 0.00001 },
      );
    });
  }
}

for (const screen of ['today', 'now'] as const) {
  for (const width of [900, 1280]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`matches ${theme} ${screen} snapshot at ${width.toString()}px`, async () => {
        expect(
          await page.evaluate(
            () => Intl.DateTimeFormat().resolvedOptions().timeZone,
          ),
        ).toBe('UTC');
        await page.setViewportSize({ width, height: 800 });
        const seeded = await page.evaluate(
          ({ today, deadline }) =>
            window.flowpilot.commands.apply({
              commands: [
                {
                  kind: 'task.create',
                  task: {
                    id: 'snapshot-risk',
                    title: 'Задача с риском срока',
                    description: '',
                    status: { kind: 'todo' },
                    columnId: 'todo',
                    day: today,
                    deadline,
                    estimate: { unit: 'workdays', value: 5 },
                    subtasks: [],
                    comments: [],
                    attachments: [],
                    addedOrder: 0,
                  },
                },
              ],
              expectedRevision: 0,
            }),
          { today: SNAPSHOT_DAY, deadline: SNAPSHOT_DEADLINE },
        );
        expect(seeded).toMatchObject({ ok: true, value: { revision: 1 } });
        await page.evaluate(() => {
          window.localStorage.clear();
        });
        await page.reload();
        expect(await page.evaluate(() => window.innerWidth)).toBe(width);
        const themeClicks = theme === 'light' ? 1 : 2;
        for (let click = 0; click < themeClicks; click += 1) {
          await page.getByRole('button', { name: /Тема:/ }).click();
        }
        if (screen === 'now') {
          await page
            .getByRole('navigation', { name: 'Представления' })
            .getByRole('button', { name: 'Сейчас' })
            .click();
        }
        // macOS renderers can disagree on an isolated edge pixel.
        await expect(page).toHaveScreenshot(
          `${screen}-${theme}-${width.toString()}.png`,
          { fullPage: true, maxDiffPixelRatio: 0.00001 },
        );
      });
    }
  }
}
test('lists rules through the restricted preload API', async () => {
  const result = await page.evaluate(() => window.flowpilot.rules.list());
  expect(result).toMatchObject({ ok: true, value: expect.any(Array) });
});
