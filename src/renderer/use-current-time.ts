import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { FlowPilotApi } from '../shared/contracts';

export interface LocalClock {
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.PlainTime;
}

function readClock(api: FlowPilotApi): LocalClock {
  const injected = api.clock.now();
  if (injected) {
    const zoned = Temporal.Instant.from(injected).toZonedDateTimeISO(
      Temporal.Now.timeZoneId(),
    );
    return { today: zoned.toPlainDate(), now: zoned.toPlainTime() };
  }
  return {
    today: Temporal.Now.plainDateISO(),
    now: Temporal.Now.plainTimeISO(),
  };
}

export function useCurrentTime(
  api: FlowPilotApi = window.flowpilot,
): LocalClock {
  const [clock, setClock] = React.useState(() => readClock(api));
  React.useEffect(() => {
    const update = (): void => {
      setClock(readClock(api));
    };
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [api]);
  return clock;
}
