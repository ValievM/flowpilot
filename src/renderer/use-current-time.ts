import React from 'react';
import { Temporal } from 'temporal-polyfill';

export interface LocalClock {
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.PlainTime;
}

function readClock(): LocalClock {
  return {
    today: Temporal.Now.plainDateISO(),
    now: Temporal.Now.plainTimeISO(),
  };
}

export function useCurrentTime(): LocalClock {
  const [clock, setClock] = React.useState(readClock);
  React.useEffect(() => {
    const update = (): void => {
      setClock(readClock());
    };
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return clock;
}
