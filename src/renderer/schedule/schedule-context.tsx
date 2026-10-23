import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { ScheduleSnapshots } from '../../shared/schedule-contracts';
import { buildSchedulePlan, type SchedulePlan } from './schedule-model';

export interface ScheduleValue {
  readonly snapshots: ScheduleSnapshots;
  readonly reload: () => Promise<void>;
}

export const ScheduleContext = React.createContext<ScheduleValue>({
  snapshots: [],
  reload: () => Promise.resolve(),
});

export function useSchedule(): ScheduleValue {
  return React.useContext(ScheduleContext);
}

/** The stored classes, read-only for screens; nothing here ever touches tasks. */
export function ScheduleProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [snapshots, setSnapshots] = React.useState<ScheduleSnapshots>([]);
  const reload = React.useCallback(async (): Promise<void> => {
    try {
      const result = await window.flowpilot.schedule.list();
      if (result.ok) setSnapshots(result.value);
    } catch {
      // Without a schedule screens simply show no classes.
    }
  }, []);
  React.useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);
  const value = React.useMemo(
    () => ({ snapshots, reload }),
    [snapshots, reload],
  );
  return (
    <ScheduleContext.Provider value={value}>
      {children}
    </ScheduleContext.Provider>
  );
}

/** The plan for "now", from the app clock (so tests and the demo clock agree). */
export function useSchedulePlan(
  today: Temporal.PlainDate,
  time: Temporal.PlainTime,
): SchedulePlan {
  const { snapshots } = useSchedule();
  return React.useMemo(
    () =>
      buildSchedulePlan(
        snapshots,
        today.toZonedDateTime({
          timeZone: Temporal.Now.timeZoneId(),
          plainTime: time,
        }),
      ),
    [snapshots, today, time],
  );
}
