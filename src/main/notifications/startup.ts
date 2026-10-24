import type { Notification } from 'electron';
import { Temporal } from 'temporal-polyfill';
import type { Clock, Repository } from '../../storage';
import type { RuntimeEnvironment } from '../runtime';
import {
  createElectronAdapter,
  createRecordingAdapter,
} from './electron-adapter';
import { startReminderLoop } from './reminder-loop';
import type { NotificationAdapter, ReminderTarget } from './reminder-service';

export interface StartupReminders {
  readonly adapter: NotificationAdapter;
  readonly start: (input: {
    repository: () => Repository | undefined;
    clock: Clock;
    openTarget: (target: ReminderTarget) => void;
  }) => () => void;
}

export function createStartupReminders(
  isPackaged: boolean,
  environment: RuntimeEnvironment,
  NotificationClass: typeof Notification,
): StartupReminders {
  const testEnabled = !isPackaged && environment.FLOWPILOT_TEST === '1';
  const calls: { title: string; body: string }[] = [];
  // Tests read what would have been shown; never set in a real build.
  if (testEnabled)
    Reflect.set(globalThis, '__FLOWPILOT_TEST_NOTIFICATIONS__', calls);
  const adapter = testEnabled
    ? createRecordingAdapter(calls)
    : createElectronAdapter(NotificationClass);
  return {
    adapter,
    start: ({ repository, clock, openTarget }) =>
      startReminderLoop(() => {
        const current = repository();
        if (!current) throw new Error('No repository yet');
        return {
          repository: current,
          adapter,
          clock,
          timeZone: Temporal.Now.timeZoneId(),
          openTarget,
        };
      }),
  };
}
