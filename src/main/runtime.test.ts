import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { selectRuntimeOptions, selectWindowOptions } from './runtime';

const systemClock = {
  now: () => Temporal.Instant.from('2026-10-06T12:00:00Z'),
};
describe('test runtime options', () => {
  it('uses test clock and profile only for unpackaged test mode', () => {
    const options = selectRuntimeOptions(
      false,
      {
        FLOWPILOT_TEST: '1',
        FLOWPILOT_E2E: '1',
        FLOWPILOT_TEST_NOW: '2026-10-05T12:00:00Z',
        FLOWPILOT_TEST_PROFILE: '/tmp/flowpilot-profile',
      },
      '/default/profile',
    );
    expect(options.profilePath).toBe('/tmp/flowpilot-profile');
    expect(options.clock.now().toString()).toBe('2026-10-05T12:00:00Z');
    expect(options.isE2E).toBe(true);
  });

  it('ignores every test setting when packaged', () => {
    const options = selectRuntimeOptions(
      true,
      {
        FLOWPILOT_TEST: '1',
        FLOWPILOT_E2E: '1',
        FLOWPILOT_TEST_NOW: '2001-01-01T00:00:00Z',
        FLOWPILOT_TEST_PROFILE: '/tmp/untrusted-profile',
      },
      '/default/profile',
      systemClock,
    );
    expect(options.profilePath).toBe('/default/profile');
    expect(options.clock.now().toString()).toBe('2026-10-06T12:00:00Z');
    expect(options.isE2E).toBe(false);
  });

  it('ignores test overrides unless the explicit test switch is enabled', () => {
    const options = selectRuntimeOptions(
      false,
      {
        FLOWPILOT_TEST_NOW: '2001-01-01T00:00:00Z',
        FLOWPILOT_TEST_PROFILE: '/tmp/untrusted-profile',
      },
      '/default/profile',
      systemClock,
    );
    expect(options.profilePath).toBe('/default/profile');
    expect(options.isE2E).toBe(false);
    expect(options.clock.now().toString()).toBe('2026-10-06T12:00:00Z');
  });
});

describe('Electron main window options', () => {
  it('keeps E2E windows hidden without background throttling', () => {
    expect(selectWindowOptions(true)).toEqual({
      show: false,
      webPreferences: { backgroundThrottling: false },
    });
  });

  it('leaves ordinary launch window options at Electron defaults', () => {
    expect(selectWindowOptions(false)).toEqual({});
  });
});
