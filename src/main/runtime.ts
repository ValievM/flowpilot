import type { BrowserWindowConstructorOptions } from 'electron';
import { Temporal } from 'temporal-polyfill';

import type { Clock } from '../storage';

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type RuntimeOptions = {
  readonly isE2E: boolean;
  readonly profilePath: string;
  readonly clock: Clock;
};

export function selectWindowOptions(
  isE2E: boolean,
): Partial<Pick<BrowserWindowConstructorOptions, 'show' | 'webPreferences'>> {
  return isE2E
    ? { show: false, webPreferences: { backgroundThrottling: false } }
    : {};
}

export function selectRuntimeOptions(
  isPackaged: boolean,
  environment: RuntimeEnvironment,
  userDataPath: string,
  systemClock: Clock = { now: () => Temporal.Now.instant() },
): RuntimeOptions {
  const isE2E = !isPackaged && environment.FLOWPILOT_E2E === '1';
  const usesTestSettings = !isPackaged && environment.FLOWPILOT_TEST === '1';
  const testNow =
    usesTestSettings && environment.FLOWPILOT_TEST_NOW
      ? Temporal.Instant.from(environment.FLOWPILOT_TEST_NOW)
      : undefined;
  return {
    isE2E,
    profilePath:
      usesTestSettings && environment.FLOWPILOT_TEST_PROFILE
        ? environment.FLOWPILOT_TEST_PROFILE
        : userDataPath,
    clock: testNow ? { now: () => testNow } : systemClock,
  };
}
