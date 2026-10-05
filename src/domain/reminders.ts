import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import { deadlineRisk } from './risk/risk';
import type { RiskKind } from './risk/risk';
import type { SeriesInstance } from './repeat';
import type { FixedEvent } from './schedule/fixed-events';
import type { Task } from './task';

export const DEFAULT_REMINDER_SETTINGS = {
  enabled: false,
  leadMinutes: 10,
} as const;
const STALE_AFTER_MINUTES = 60;

type Reminder = {
  key: string;
  title: string;
  at: TemporalTypes.ZonedDateTime;
};

type ReminderLedger = {
  sent: readonly string[];
  risks: Readonly<Record<string, RiskKind>>;
};

type ReminderInput = {
  tasks: readonly Task[];
  events: readonly FixedEvent[];
  instances: readonly SeriesInstance[];
  ledger: ReminderLedger;
  workdays?: ReadonlySet<number>;
};

type ReminderPlan = {
  reminders: readonly Reminder[];
  ledger: ReminderLedger;
};

type ReminderSettings = {
  enabled: boolean;
  leadMinutes: number;
};
type RiskReminderInput = {
  tasks: readonly Task[];
  previous: Readonly<Record<string, RiskKind>>;
  current: Readonly<Record<string, RiskKind>>;
  sent: readonly string[];
  now: TemporalTypes.ZonedDateTime;
  workdays: ReadonlySet<number> | undefined;
};

export function planReminders(
  input: ReminderInput,
  now: TemporalTypes.ZonedDateTime,
  settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS,
): ReminderPlan {
  if (!settings.enabled) return { reminders: [], ledger: input.ledger };
  const planned = [
    ...eventReminders(input.events, now, settings.leadMinutes),
    ...taskReminders(input.tasks, now, settings.leadMinutes),
    ...instanceReminders(input.instances, now, settings.leadMinutes),
  ];
  const riskState = taskRisk(input.tasks, now, input.workdays);
  const risks = { ...input.ledger.risks, ...riskState };
  const activeRisks = new Set(
    Object.keys(riskState).filter((id) => isRisk(riskState[id])),
  );
  const sent = input.ledger.sent.filter(
    (key) => !key.startsWith('risk:') || activeRisks.has(key.slice(5)),
  );
  planned.push(
    ...riskReminders({
      tasks: input.tasks,
      previous: input.ledger.risks,
      current: risks,
      sent,
      now,
      workdays: input.workdays,
    }),
  );
  const reminders = deduplicate(planned, new Set(sent), now);
  return {
    reminders,
    ledger: { sent: [...sent, ...reminders.map(({ key }) => key)], risks },
  };
}

function eventReminders(
  events: readonly FixedEvent[],
  now: TemporalTypes.ZonedDateTime,
  leadMinutes: number,
): Reminder[] {
  return events
    .filter((event) => !event.cancelled)
    .map((event) => ({
      key: `event:${event.key}:${event.start.toInstant().toString()}`,
      title: event.title,
      at: event.start.subtract({ minutes: leadMinutes }),
    }))
    .filter(
      (item) =>
        item.at.toInstant().since(now.toInstant()).total('minutes') <= 0,
    );
}

function taskReminders(
  tasks: readonly Task[],
  now: TemporalTypes.ZonedDateTime,
  leadMinutes: number,
): Reminder[] {
  return tasks.flatMap((task) => {
    if (
      !task.day ||
      !task.time ||
      task.status.kind === 'done' ||
      task.status.kind === 'waiting'
    )
      return [];
    const at = task.day
      .toPlainDateTime(task.time)
      .toZonedDateTime(now.timeZoneId)
      .subtract({ minutes: leadMinutes });
    return [
      {
        key: `task:${task.id}:${task.day.toString()}`,
        title: task.title,
        at,
      },
    ].filter(
      (item) =>
        item.at.toInstant().since(now.toInstant()).total('minutes') <= 0,
    );
  });
}

function instanceReminders(
  instances: readonly SeriesInstance[],
  now: TemporalTypes.ZonedDateTime,
  leadMinutes: number,
): Reminder[] {
  return instances.flatMap((instance) => {
    if (instance.state !== 'pending' || !instance.time) return [];
    const at = instance.date
      .toPlainDateTime(instance.time)
      .toZonedDateTime(now.timeZoneId)
      .subtract({ minutes: leadMinutes });
    return [
      {
        key: `repeat:${instance.seriesId}:${instance.date.toString()}`,
        title: 'Повторяемое дело',
        at,
      },
    ].filter(
      (item) =>
        item.at.toInstant().since(now.toInstant()).total('minutes') <= 0,
    );
  });
}

function taskRisk(
  tasks: readonly Task[],
  now: TemporalTypes.ZonedDateTime,
  workdays: ReadonlySet<number> | undefined,
): Record<string, RiskKind> {
  if (!workdays) return {};
  return Object.fromEntries(
    tasks.map((task): [string, RiskKind] => {
      if (task.status.kind === 'done') return [task.id, 'none'];
      const result = deadlineRisk(task, now.toPlainDate(), workdays);
      return [task.id, result.ok ? result.risk : 'none'];
    }),
  );
}

function riskReminders(input: RiskReminderInput): Reminder[] {
  if (!input.workdays) return [];
  return input.tasks
    .filter(
      (task) =>
        isRisk(input.current[task.id]) &&
        !isRisk(input.previous[task.id]) &&
        !input.sent.includes(`risk:${task.id}`),
    )
    .map((task) => ({
      key: `risk:${task.id}`,
      title: 'Риск не успеть',
      at: input.now,
    }));
}

function isRisk(risk: RiskKind | undefined): boolean {
  return risk === 'tight' || risk === 'short';
}

function deduplicate(
  reminders: readonly Reminder[],
  sent: ReadonlySet<string>,
  now: TemporalTypes.ZonedDateTime,
): Reminder[] {
  return reminders.filter(
    (item) =>
      !sent.has(item.key) &&
      item.at.toInstant().since(now.toInstant()).total('minutes') >=
        -STALE_AFTER_MINUTES,
  );
}
