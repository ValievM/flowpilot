import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThemeChoice } from '../shared/contracts';
import type { Result } from '../shared/ipc-result';
import { App } from './App';
import { isThemeChoice } from './theme/use-theme';
import './styles/tokens.css';
import './styles/app.css';
import './styles/responsive.css';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root is missing');
const renderRoot = root;
interface InitialThemeState {
  readonly theme: ThemeChoice;
  readonly isSynchronized: boolean;
}

async function resolveInitialTheme(
  initialization: Result<ThemeChoice>,
  legacyTheme: ThemeChoice | undefined,
): Promise<InitialThemeState> {
  if (initialization.ok) {
    return { theme: initialization.value, isSynchronized: true };
  }
  const settings = await window.flowpilot.settings.get();
  if (!settings.ok) return { theme: 'system', isSynchronized: false };
  if (isThemeChoice(settings.value.theme)) {
    return { theme: settings.value.theme, isSynchronized: true };
  }
  return { theme: 'system', isSynchronized: legacyTheme === undefined };
}

async function startRenderer(): Promise<void> {
  const storedLegacyTheme = window.localStorage.getItem('flowpilot-theme');
  const legacyTheme =
    isThemeChoice(storedLegacyTheme) && storedLegacyTheme !== 'system'
      ? storedLegacyTheme
      : undefined;
  const initialization = await window.flowpilot.appearance.initialize(
    legacyTheme ? { legacyTheme } : {},
  );
  const appearance = await resolveInitialTheme(initialization, legacyTheme);
  if (appearance.isSynchronized)
    window.localStorage.removeItem('flowpilot-theme');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.dataset.theme =
    appearance.theme === 'system'
      ? media.matches
        ? 'dark'
        : 'light'
      : appearance.theme;
  flushSync(() => {
    createRoot(renderRoot).render(<App initialTheme={appearance.theme} />);
  });
  if (appearance.isSynchronized) await window.flowpilot.appearance.ready();
}

void startRenderer();
