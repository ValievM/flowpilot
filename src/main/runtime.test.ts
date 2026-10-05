import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { selectRuntimeOptions } from './runtime';

const systemClock = {
  now: () => Temporal.Instant.from('2026-10-06T12:00:00Z'),
};
describe('test runtime options', () => {
  it('uses test clock and profile only for unpackaged test mode', () => {
    const options = selectRuntimeOptions(
      false,
      {
        FLOWPILOT_TEST: '1',
        FLOWPILOT_TEST_NOW: '2026-10-05T12:00:00Z',
        FLOWPILOT_TEST_PROFILE: '/tmp/flowpilot-profile',
      },
      '/default/profile',
    );
    expect(options.profilePath).toBe('/tmp/flowpilot-profile');
    expect(options.clock.now().toString()).toBe('2026-10-05T12:00:00Z');
  });

  it('ignores every test setting when packaged', () => {
    const options = selectRuntimeOptions(
      true,
      {
        FLOWPILOT_TEST: '1',
        FLOWPILOT_TEST_NOW: '2001-01-01T00:00:00Z',
        FLOWPILOT_TEST_PROFILE: '/tmp/untrusted-profile',
      },
      '/default/profile',
      systemClock,
    );
    expect(options.profilePath).toBe('/default/profile');
    expect(options.clock.now().toString()).toBe('2026-10-06T12:00:00Z');
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
    expect(options.clock.now().toString()).toBe('2026-10-06T12:00:00Z');
  });
});
