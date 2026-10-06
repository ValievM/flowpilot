import { vi } from 'vitest';

export function mockSystemTheme(matches: boolean): (matches: boolean) => void {
  let currentMatches = matches;
  const listeners: Array<(event: { matches: boolean }) => void> = [];
  const mediaQuery = {
    get matches(): boolean {
      return currentMatches;
    },
    addEventListener: (
      _event: string,
      listener: (event: { matches: boolean }) => void,
    ): void => {
      listeners.push(listener);
    },
    removeEventListener: (
      _event: string,
      listener: (event: { matches: boolean }) => void,
    ): void => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQuery),
  );
  return (nextMatches) => {
    currentMatches = nextMatches;
    listeners.forEach((listener) => {
      listener({ matches: nextMatches });
    });
  };
}
