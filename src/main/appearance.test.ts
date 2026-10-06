import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../storage';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import {
  appearanceThemeRequestSchema,
  settingsSetRequestSchema,
} from '../shared/contracts';
import {
  applyAppearanceTheme,
  initialAppearanceTheme,
  isTrustedNavigation,
} from './appearance';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-appearance-'));
  directories.push(directory);
  return new Repository(join(directory, 'flowpilot.db'), clock);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('window appearance', () => {
  it.each(['light', 'dark', 'system'] as const)(
    'applies and persists the %s choice',
    (theme) => {
      const repository = openRepository();
      const nativeTheme = {
        themeSource: 'system' as 'system' | 'light' | 'dark',
      };

      const result = applyAppearanceTheme(
        { theme },
        { repository, nativeTheme },
      );

      expect(result).toEqual({ ok: true, value: null });
      expect(nativeTheme.themeSource).toBe(theme);
      expect(repository.load().settings.theme).toBe(theme);
      repository.close();
    },
  );

  it('rejects invalid and extra appearance fields without changing the setting', () => {
    expect(
      appearanceThemeRequestSchema.safeParse({ theme: 'ultraviolet' }).success,
    ).toBe(false);
    expect(
      appearanceThemeRequestSchema.safeParse({
        theme: 'light',
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      settingsSetRequestSchema.safeParse({
        key: 'theme',
        value: 'light',
        expectedRevision: 0,
      }).success,
    ).toBe(true);
    expect(
      settingsSetRequestSchema.safeParse({
        key: 'theme',
        value: 'invalid',
        expectedRevision: 0,
      }).success,
    ).toBe(false);
    const repository = openRepository();
    const nativeTheme = {
      themeSource: 'system' as 'system' | 'light' | 'dark',
    };

    expect(
      applyAppearanceTheme({ theme: 'invalid' }, { repository, nativeTheme }),
    ).toEqual({
      ok: false,
      error: 'ValidationFailed',
    });
    expect(nativeTheme.themeSource).toBe('system');
    expect(Object.hasOwn(repository.load().settings, 'theme')).toBe(false);
    repository.close();
  });

  it('uses a valid saved choice and falls back to system', () => {
    expect(initialAppearanceTheme({ theme: 'dark' })).toBe('dark');
    expect(initialAppearanceTheme({ theme: 'unknown' })).toBe('system');
    expect(initialAppearanceTheme({})).toBe('system');
  });

  it('allows only the trusted app document or its development server origin', () => {
    expect(
      isTrustedNavigation('file:///app/index.html', 'file:///app/index.html'),
    ).toBe(true);
    expect(
      isTrustedNavigation(
        'file://remote/app/index.html',
        'file:///app/index.html',
      ),
    ).toBe(false);
    expect(
      isTrustedNavigation('file:///app/other.html', 'file:///app/index.html'),
    ).toBe(false);
    expect(
      isTrustedNavigation('http://localhost:5173/', 'http://localhost:5173/'),
    ).toBe(true);
    expect(
      isTrustedNavigation('http://example.com/', 'http://localhost:5173/'),
    ).toBe(false);
    expect(isTrustedNavigation('not a url', 'http://localhost:5173/')).toBe(
      false,
    );
  });
});
