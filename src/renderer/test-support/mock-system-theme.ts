import { vi } from 'vitest';

type MediaListener = (event: { matches: boolean }) => void;
type MediaQueryMock = {
  readonly matches: boolean;
  addEventListener(event: string, listener: MediaListener): void;
  removeEventListener(event: string, listener: MediaListener): void;
};

function mediaQueryFor(
  query: string,
  matchesByQuery: ReadonlyMap<string, boolean>,
  listenersByQuery: Map<string, MediaListener[]>,
): MediaQueryMock {
  const listeners = listenersByQuery.get(query) ?? [];
  listenersByQuery.set(query, listeners);
  return {
    get matches(): boolean {
      return matchesByQuery.get(query) ?? false;
    },
    addEventListener: (_event, listener) => {
      listeners.push(listener);
    },
    removeEventListener: (_event, listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
}

export function mockSystemTheme(
  reducedMotionMatches: boolean,
  colorSchemeMatches = reducedMotionMatches,
): (matches: boolean) => void {
  const matchesByQuery = new Map([
    ['(prefers-color-scheme: dark)', colorSchemeMatches],
    ['(prefers-reduced-motion: reduce)', reducedMotionMatches],
  ]);
  const listenersByQuery = new Map<string, MediaListener[]>();
  const mediaQueries = new Map<string, MediaQueryMock>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const existing = mediaQueries.get(query);
      if (existing) return existing;
      const mediaQuery = mediaQueryFor(query, matchesByQuery, listenersByQuery);
      mediaQueries.set(query, mediaQuery);
      return mediaQuery;
    }),
  );
  return (nextMatches) => {
    for (const query of matchesByQuery.keys()) {
      matchesByQuery.set(query, nextMatches);
      listenersByQuery.get(query)?.forEach((listener) => {
        listener({ matches: nextMatches });
      });
    }
  };
}
