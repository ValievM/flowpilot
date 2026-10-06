import type { ThemeChoice } from '../../shared/contracts';
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

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
  const isFirstRender = useRef(true);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (): void => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    media.addEventListener('change', applyTheme);
    applyTheme();
    if (theme === 'system') {
      window.localStorage.removeItem(themeStorageKey);
    } else {
      window.localStorage.setItem(themeStorageKey, theme);
    }
    if (isFirstRender.current) {
      isFirstRender.current = false;
    } else {
      void window.flowpilot.appearance.setTheme({ theme });
    }
    return () => {
      media.removeEventListener('change', applyTheme);
    };
  }, [theme]);

  return [theme, setTheme];
}
