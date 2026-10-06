import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { ThemeChoice } from '../shared/contracts';
import { App } from './App';
import { isThemeChoice } from './theme/use-theme';
import './styles/tokens.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root is missing');
const renderRoot = root;

async function startRenderer(): Promise<void> {
  const legacyTheme = window.localStorage.getItem('flowpilot-theme');
  const initialization = await window.flowpilot.appearance.initialize(
    isThemeChoice(legacyTheme) && legacyTheme !== 'system'
      ? { legacyTheme }
      : {},
  );
  let theme: ThemeChoice = 'system';
  let isThemeSynchronized = initialization.ok;
  if (initialization.ok) {
    theme = initialization.value;
  } else {
    const settings = await window.flowpilot.settings.get();
    if (
      settings.ok &&
      Object.hasOwn(settings.value, 'theme') &&
      isThemeChoice(settings.value.theme)
    ) {
      theme = settings.value.theme;
      isThemeSynchronized = true;
    }
  }
  if (isThemeSynchronized) window.localStorage.removeItem('flowpilot-theme');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  document.documentElement.dataset.theme =
    theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
  flushSync(() => {
    createRoot(renderRoot).render(<App initialTheme={theme} />);
  });
  await window.flowpilot.appearance.ready();
}

void startRenderer();
