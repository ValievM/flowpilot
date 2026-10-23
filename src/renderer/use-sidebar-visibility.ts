import React from 'react';

const KEY = 'flowpilot.sidebar';

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'hidden';
  } catch {
    return false;
  }
}

/** Remembers per viewer whether the sidebar is hidden; works without storage. */
export function useSidebarVisibility(): {
  readonly hidden: boolean;
  readonly toggle: () => void;
} {
  const [hidden, setHidden] = React.useState(readHidden);
  const toggle = React.useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(KEY, next ? 'hidden' : 'shown');
      } catch {
        // The choice still applies for this session.
      }
      return next;
    });
  }, []);
  return { hidden, toggle };
}
