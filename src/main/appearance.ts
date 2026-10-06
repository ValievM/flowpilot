import type { NativeTheme } from 'electron';
import {
  appearanceInitializeRequestSchema,
  appearanceThemeRequestSchema,
  type ThemeChoice,
} from '../shared/contracts';
import type { Result } from '../shared/ipc-result';
import type { Repository } from '../storage/repository';

interface AppearanceDependencies {
  readonly repository: Repository;
  readonly nativeTheme: Pick<NativeTheme, 'themeSource'>;
}

export function initialAppearanceTheme(
  settings: Readonly<Record<string, unknown>>,
): ThemeChoice {
  const theme = settings.theme;
  return theme === 'light' || theme === 'dark' || theme === 'system'
    ? theme
    : 'system';
}

export function initializeAppearanceTheme(
  request: unknown,
  dependencies: AppearanceDependencies,
): Result<ThemeChoice> {
  const parsed = appearanceInitializeRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  try {
    const { repository, nativeTheme } = dependencies;
    const current = repository.load();
    const hasSavedTheme = Object.hasOwn(current.settings, 'theme');
    const theme = hasSavedTheme
      ? initialAppearanceTheme(current.settings)
      : (parsed.data.legacyTheme ?? 'system');
    if (!hasSavedTheme && parsed.data.legacyTheme) {
      const result = repository.apply(
        [{ kind: 'setting.set', key: 'theme', value: theme }],
        current.revision,
      );
      if (!result.ok) return { ok: false, error: 'StaleRevision' };
    }
    nativeTheme.themeSource = theme;
    return { ok: true, value: theme };
  } catch {
    return { ok: false, error: 'InternalError' };
  }
}

export function applyAppearanceTheme(
  request: unknown,
  dependencies: AppearanceDependencies,
): Result<null> {
  const parsed = appearanceThemeRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  try {
    const { repository, nativeTheme } = dependencies;
    const current = repository.load();
    const result = repository.apply(
      [{ kind: 'setting.set', key: 'theme', value: parsed.data.theme }],
      current.revision,
    );
    if (!result.ok)
      return {
        ok: false,
        error:
          result.error.kind === 'StaleRevision'
            ? 'StaleRevision'
            : 'ValidationFailed',
      };
    nativeTheme.themeSource = parsed.data.theme;
    return { ok: true, value: null };
  } catch {
    return { ok: false, error: 'InternalError' };
  }
}

export function isTrustedNavigation(
  targetAddress: string,
  applicationAddress: string,
): boolean {
  try {
    const target = new URL(targetAddress);
    const application = new URL(applicationAddress);
    if (target.username || target.password) return false;
    if (target.protocol !== application.protocol) return false;
    if (target.protocol === 'file:') {
      return (
        target.host === application.host &&
        target.pathname === application.pathname
      );
    }
    return target.origin === application.origin;
  } catch {
    return false;
  }
}
