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
interface ThemeSaveState {
  readonly persistedTheme: { current: ThemeChoice };
  readonly latestRequest: { current: number };
  readonly saveQueue: { current: Promise<void> };
  readonly setTheme: Dispatch<SetStateAction<ThemeChoice>>;
}

function queueThemeSave(
  theme: ThemeChoice,
  requestId: number,
  state: ThemeSaveState,
): void {
  state.saveQueue.current = state.saveQueue.current
    .then(async () => {
      const result = await window.flowpilot.appearance.setTheme({ theme });
      if (result.ok) {
        state.persistedTheme.current = theme;
        return;
      }
      if (requestId === state.latestRequest.current) {
        state.setTheme((current) =>
          current === theme ? state.persistedTheme.current : current,
        );
      }
    })
    .catch(() => {
      if (requestId === state.latestRequest.current) {
        state.setTheme((current) =>
          current === theme ? state.persistedTheme.current : current,
        );
      }
    });
}

export function useTheme(
  initialChoice: ThemeChoice,
): readonly [ThemeChoice, Dispatch<SetStateAction<ThemeChoice>>] {
  const [theme, setTheme] = useState<ThemeChoice>(initialChoice);
  const isFirstRender = useRef(true);
  const persistedTheme = useRef(initialChoice);
  const latestRequest = useRef(0);
  const saveQueue = useRef(Promise.resolve());

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
    queueThemeSave(theme, ++latestRequest.current, {
      persistedTheme,
      latestRequest,
      saveQueue,
      setTheme,
    });
  }, [theme]);

  return [theme, setTheme];
}
