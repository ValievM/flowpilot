import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { FlowPilotApi } from '../shared/contracts';

export interface LocalClock {
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.PlainTime;
  readonly isReady: boolean;
}

function localClock(instant: Temporal.Instant, isReady: boolean): LocalClock {
  const zoned = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  return {
    today: zoned.toPlainDate(),
    now: zoned.toPlainTime(),
    isReady,
  };
}

export function useCurrentTime(
  api: FlowPilotApi = window.flowpilot,
): LocalClock {
  const [clock, setClock] = React.useState(() =>
    localClock(Temporal.Instant.from('2000-01-01T00:00:00Z'), false),
  );
  React.useEffect(() => {
    let active = true;
    let baseInstant: Temporal.Instant | undefined;
    let basePerformanceTime = 0;
    const update = async (): Promise<void> => {
      const result = await api.app.info();
      if (!active || !result.ok) return;
      baseInstant = Temporal.Instant.from(result.value.now);
      basePerformanceTime = performance.now();
      setClock(localClock(baseInstant, true));
    };
    const tick = (): void => {
      if (!baseInstant) return;
      const elapsed = Math.floor(performance.now() - basePerformanceTime);
      setClock(localClock(baseInstant.add({ milliseconds: elapsed }), true));
    };
    const refresh = (): void => {
      void update();
    };
    refresh();
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [api]);
  return clock;
}
