import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const themeStorageKey = 'flowpilot-theme';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

function initialTheme(): ThemeChoice {
  const stored = window.localStorage.getItem(themeStorageKey);
  return isThemeChoice(stored) ? stored : 'system';
}

export function useTheme(): readonly [
  ThemeChoice,
  Dispatch<SetStateAction<ThemeChoice>>,
] {
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (): void => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    applyTheme();
    media.addEventListener('change', applyTheme);
    if (theme === 'system') {
      window.localStorage.removeItem(themeStorageKey);
    } else {
      window.localStorage.setItem(themeStorageKey, theme);
    }
    return () => {
      media.removeEventListener('change', applyTheme);
    };
  }, [theme]);

  return [theme, setTheme];
}
