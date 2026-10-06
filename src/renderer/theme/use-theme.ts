import type { ThemeChoice } from '../../shared/contracts';
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function useTheme(
  initialChoice: ThemeChoice,
): readonly [ThemeChoice, Dispatch<SetStateAction<ThemeChoice>>] {
  const [theme, setTheme] = useState<ThemeChoice>(initialChoice);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (): void => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    media.addEventListener('change', applyTheme);
    applyTheme();
    return () => {
      media.removeEventListener('change', applyTheme);
    };
  }, [theme]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void window.flowpilot.appearance.setTheme({ theme });
  }, [theme]);

  return [theme, setTheme];
}
