import { runReminderTick, type ReminderDeps } from './reminder-service';

const ONE_MINUTE_MS = 60_000;

/** Checks reminders while the app runs: no daemons, nothing when the app is closed. */
export function startReminderLoop(
  deps: () => ReminderDeps,
  intervalMs: number = ONE_MINUTE_MS,
): () => void {
  const timer = setInterval(() => {
    try {
      runReminderTick(deps());
    } catch {
      // A failed check is retried a minute later.
    }
  }, intervalMs);
  return () => {
    clearInterval(timer);
  };
}
