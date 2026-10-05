import { Temporal } from 'temporal-polyfill';
import type { Clock } from '../storage';

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type RuntimeOptions = {
  readonly profilePath: string;
  readonly clock: Clock;
};

export function selectRuntimeOptions(
  isPackaged: boolean,
  environment: RuntimeEnvironment,
  userDataPath: string,
  systemClock: Clock = { now: () => Temporal.Now.instant() },
): RuntimeOptions {
  const usesTestSettings = !isPackaged && environment.FLOWPILOT_TEST === '1';
  const testNow =
    usesTestSettings && environment.FLOWPILOT_TEST_NOW
      ? Temporal.Instant.from(environment.FLOWPILOT_TEST_NOW)
      : undefined;
  return {
    profilePath:
      usesTestSettings && environment.FLOWPILOT_TEST_PROFILE
        ? environment.FLOWPILOT_TEST_PROFILE
        : userDataPath,
    clock: testNow ? { now: () => testNow } : systemClock,
  };
}
