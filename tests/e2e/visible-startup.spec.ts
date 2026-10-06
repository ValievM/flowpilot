import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testNow = '2026-10-05T12:00:00Z';

for (const theme of ['light', 'dark'] as const) {
  test(`shows the migrated ${theme} theme on the first visible frame without E2E mode`, async () => {
    const profilePath = mkdtempSync(path.join(tmpdir(), 'flowpilot-visible-'));
    let app: ElectronApplication | undefined;
    let page: Page | undefined;
    const launch = async (): Promise<void> => {
      const environment: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) environment[key] = value;
      }
      environment.FLOWPILOT_TEST = '1';
      environment.FLOWPILOT_TEST_NOW = testNow;
      environment.FLOWPILOT_TEST_PROFILE = profilePath;
      delete environment.FLOWPILOT_E2E;
      app = await electron.launch({
        args: [path.resolve(__dirname, '../..')],
        env: environment,
      });
      page = await app.firstWindow();
    };

    try {
      await launch();
      const initialPage = page;
      const initialApp = app;
      if (!initialPage || !initialApp)
        throw new Error('Electron launch failed');
      await expect(
        initialPage.getByRole('heading', { name: 'Сегодня пока пусто' }),
      ).toBeVisible();
      await initialPage.evaluate((legacyTheme) => {
        window.localStorage.setItem('flowpilot-theme', legacyTheme);
      }, theme);
      await initialApp.close();

      await launch();
      const migratedApp = app;
      if (!migratedApp) throw new Error('Electron launch failed');
      await expect
        .poll(() =>
          migratedApp.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0]?.isVisible(),
          ),
        )
        .toBe(true);
      const actualState = await migratedApp.evaluate(
        async ({ BrowserWindow, nativeTheme }) => {
          const window = BrowserWindow.getAllWindows()[0];
          const rendererValue: unknown = window
            ? await window.webContents.executeJavaScript(
                'document.documentElement.dataset.theme',
              )
            : null;
          return {
            visible: window?.isVisible(),
            nativeTheme: nativeTheme.themeSource,
            rendererTheme:
              typeof rendererValue === 'string' ? rendererValue : null,
            e2eMode: process.env.FLOWPILOT_E2E ?? null,
          };
        },
      );
      console.log('Visible startup state:', JSON.stringify(actualState));
      expect(actualState).toEqual({
        visible: true,
        nativeTheme: theme,
        rendererTheme: theme,
        e2eMode: null,
      });
    } finally {
      await app?.close();
      rmSync(profilePath, { recursive: true, force: true });
    }
  });
}
