import { Temporal } from 'temporal-polyfill';
import { instancesOn } from '../../domain/repeats';
import {
  DEFAULT_REMINDER_SETTINGS,
  planReminders,
} from '../../domain/reminders';
import type { FixedEvent } from '../../domain/schedule/fixed-events';
import {
  importedFixedEvent,
  isManualEvent,
  manualFixedEvents,
} from '../../domain/schedule/stored-events';
import type { Clock, Repository } from '../../storage';

export type NotificationPermission = 'unknown' | 'granted' | 'denied';
export type ReminderTarget =
  { readonly kind: 'task'; readonly id: string } | { readonly kind: 'today' };

export interface NotificationAdapter {
  show(input: {
    title: string;
    body: string;
    onClick: () => void;
  }): Promise<'shown' | 'failed'>;
}

export interface ReminderDeps {
  readonly repository: Repository;
  readonly adapter: NotificationAdapter;
  readonly clock: Clock;
  readonly timeZone: string;
  readonly openTarget: (target: ReminderTarget) => void;
}

export interface ReminderSettingsView {
  readonly enabled: boolean;
  readonly leadMinutes: number;
  readonly permission: NotificationPermission;
}

export function readReminderSettings(
  settings: Readonly<Record<string, unknown>>,
): ReminderSettingsView {
  const permission = settings.notificationPermission;
  const lead = settings.reminderLeadMinutes;
  return {
    enabled: settings.remindersEnabled === true,
    leadMinutes:
      typeof lead === 'number' ? lead : DEFAULT_REMINDER_SETTINGS.leadMinutes,
    permission:
      permission === 'granted' || permission === 'denied'
        ? permission
        : 'unknown',
  };
}

function targetOf(key: string): ReminderTarget {
  const task = /^(?:task|risk):([^:]+)/.exec(key);
  return task?.[1] ? { kind: 'task', id: task[1] } : { kind: 'today' };
}

function fixedEvents(
  repository: Repository,
  today: Temporal.PlainDate,
): FixedEvent[] {
  return repository.schedule
    .snapshots()
    .flatMap((snapshot) =>
      snapshot.events.flatMap((event) =>
        isManualEvent(event)
          ? manualFixedEvents(
              event,
              today.subtract({ days: 1 }),
              today.add({ days: 1 }),
            )
          : [importedFixedEvent(event)],
      ),
    );
}

/** Keys of past days are forgotten; risk state stays so a risk is announced once. */
function pruned(sent: readonly string[], today: Temporal.PlainDate): string[] {
  const oldest = today.subtract({ days: 1 }).toString();
  return sent.filter((key) => {
    if (key.startsWith('risk:')) return true;
    const day = /(\d{4}-\d{2}-\d{2})(?:T[\d:.]+Z)?$/.exec(key)?.[1];
    return day === undefined || day >= oldest;
  });
}

/**
 * One check, while the app is running. Never asks macOS for anything and never
 * calls the AI: it only announces what the planner says is due and not yet sent.
 */
export function runReminderTick(deps: ReminderDeps): number {
  const snapshot = deps.repository.load();
  const settings = readReminderSettings(snapshot.settings);
  if (!settings.enabled || settings.permission !== 'granted') return 0;
  const now = deps.clock.now().toZonedDateTimeISO(deps.timeZone);
  const today = now.toPlainDate();
  const workdays = snapshot.settings.workdays;
  const ledger = deps.repository.reminders.readLedger();
  const plan = planReminders(
    {
      tasks: snapshot.tasks,
      events: fixedEvents(deps.repository, today),
      instances: snapshot.series.flatMap((series) => {
        const instance = instancesOn(series, snapshot.outcomes, today);
        return instance ? [instance] : [];
      }),
      ledger: { sent: ledger.sent, risks: ledger.risks as never },
      ...(Array.isArray(workdays)
        ? {
            workdays: new Set(
              workdays.filter((day) => typeof day === 'number'),
            ),
          }
        : {}),
    },
    now,
    { enabled: true, leadMinutes: settings.leadMinutes },
  );
  deps.repository.reminders.writeLedger({
    sent: pruned(plan.ledger.sent, today),
    risks: plan.ledger.risks,
  });
  for (const reminder of plan.reminders)
    void deps.adapter.show({
      title: reminder.title,
      body: reminder.at.toPlainTime().toString({ smallestUnit: 'minute' }),
      onClick: () => {
        deps.openTarget(targetOf(reminder.key));
      },
    });
  return plan.reminders.length;
}

/** Asked for only when the person presses "Настроить": show one real notification and see what happens. */
export async function requestNotificationPermission(
  deps: ReminderDeps,
): Promise<NotificationPermission> {
  const outcome = await deps.adapter.show({
    title: 'FlowPilot',
    body: 'Напоминания включены.',
    onClick: () => undefined,
  });
  const permission = outcome === 'shown' ? 'granted' : 'denied';
  deps.repository.apply(
    [{ kind: 'setting.set', key: 'notificationPermission', value: permission }],
    deps.repository.load().revision,
  );
  return permission;
}
