import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: [
    ...(process.env.FLOWPILOT_E2E === '1'
      ? ['**/visible-startup.spec.ts']
      : []),
    // The packaged app opens visible windows; run it only through smoke:packaged.
    ...(process.env.FLOWPILOT_PACKAGED_SMOKE === '1'
      ? []
      : ['**/packaged-smoke.spec.ts']),
  ],
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  expect: { toHaveScreenshot: { animations: 'disabled' } },
});
