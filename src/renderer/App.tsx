import React from 'react';

export function App(): React.JSX.Element {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <main className="welcome" data-testid="welcome">
      <p className="welcome-eyebrow">FlowPilot</p>
      <h1>FlowPilot</h1>
      <p className="welcome-copy">Ваш день начинается с ясного плана.</p>
      <button
        className="theme-toggle"
        type="button"
        onClick={() => {
          setTheme((current) => (current === 'light' ? 'dark' : 'light'));
        }}
      >
        Переключить тему
      </button>
    </main>
  );
}
