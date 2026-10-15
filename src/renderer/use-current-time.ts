import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { FlowPilotApi } from '../shared/flowpilot-api';

export interface ClockState {
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.PlainTime;
  readonly isReady: boolean;
  readonly error?: string;
}

export interface LocalClock extends ClockState {
  readonly retry: () => void;
}

function localClock(instant: Temporal.Instant, isReady: boolean): ClockState {
  const zoned = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  return {
    today: zoned.toPlainDate(),
    now: zoned.toPlainTime(),
    isReady,
  };
}

async function appInstant(
  api: FlowPilotApi,
): Promise<Temporal.Instant | undefined> {
  const result = await api.app.info();
  if (!result.ok) return undefined;
  return Temporal.Instant.from(result.value.now);
}

function failedClockState(current: ClockState): ClockState {
  return {
    ...current,
    error: 'Не удалось получить текущее время приложения.',
  };
}
function advancedClock(
  instant: Temporal.Instant | undefined,
  basePerformanceTime: number,
): ClockState | undefined {
  if (!instant) return undefined;
  const elapsed = Math.floor(performance.now() - basePerformanceTime);
  return localClock(instant.add({ milliseconds: elapsed }), true);
}
function watchClock(refresh: () => void, tick: () => void): () => void {
  const timer = window.setInterval(tick, 60_000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
  };
}

export function useCurrentTime(
  api: FlowPilotApi = window.flowpilot,
): LocalClock {
  const [retryCount, setRetryCount] = React.useState(0);
  const [clock, setClock] = React.useState<ClockState>(() =>
    localClock(Temporal.Now.instant(), false),
  );
  React.useEffect(() => {
    let active = true;
    let baseInstant: Temporal.Instant | undefined;
    let basePerformanceTime = 0;
    const update = async (): Promise<void> => {
      try {
        const instant = await appInstant(api);
        if (!active) return;
        if (!instant) {
          setClock(failedClockState);
          return;
        }
        baseInstant = instant;
        basePerformanceTime = performance.now();
        setClock(localClock(instant, true));
      } catch {
        if (active) setClock(failedClockState);
      }
    };
    const tick = (): void => {
      const next = advancedClock(baseInstant, basePerformanceTime);
      if (next) setClock(next);
    };
    const refresh = (): void => {
      void update();
    };
    refresh();
    const stopWatching = watchClock(refresh, tick);
    return () => {
      active = false;
      stopWatching();
    };
  }, [api, retryCount]);
  return {
    ...clock,
    retry: () => {
      setRetryCount((count) => count + 1);
    },
  };
}
