import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type {
  MissedInstance,
  Outcome,
  RescheduleOutcome,
  Series,
  SeriesInstance,
  SkipGroup,
} from './repeat';

function isScheduled(series: Series, date: TemporalTypes.PlainDate): boolean {
  return (
    Temporal.PlainDate.compare(date, series.startsOn) >= 0 &&
    (!series.endsOn || Temporal.PlainDate.compare(date, series.endsOn) <= 0) &&
    series.weekdays.includes(date.dayOfWeek)
  );
}

function latestOutcome(
  outcomes: readonly Outcome[],
  seriesId: string,
  date: TemporalTypes.PlainDate,
): Outcome | undefined {
  return outcomes
    .filter(
      (outcome) => outcome.seriesId === seriesId && outcome.date.equals(date),
    )
    .reduce<Outcome | undefined>((latest, current) => {
      if (
        !latest ||
        Temporal.Instant.compare(current.recordedAt, latest.recordedAt) > 0
      ) {
        return current;
      }
      return latest;
    }, undefined);
}

function movedInstance(
  outcomes: readonly Outcome[],
  seriesId: string,
  date: TemporalTypes.PlainDate,
): Extract<Outcome, { kind: 'rescheduled' }> | undefined {
  return outcomes
    .filter(
      (outcome): outcome is Extract<Outcome, { kind: 'rescheduled' }> =>
        outcome.kind === 'rescheduled' &&
        outcome.seriesId === seriesId &&
        outcome.newDate.equals(date),
    )
    .reduce<Extract<Outcome, { kind: 'rescheduled' }> | undefined>(
      (latest, current) => {
        if (
          !latest ||
          Temporal.Instant.compare(current.recordedAt, latest.recordedAt) > 0
        ) {
          return current;
        }
        return latest;
      },
      undefined,
    );
}

function instanceState(
  outcome: Outcome | undefined,
): SeriesInstance['state'] | undefined {
  switch (outcome?.kind) {
    case 'done':
    case 'skipped':
      return outcome.kind;
    case 'dismissed':
    case 'rescheduled':
      return undefined;
    default:
      return 'pending';
  }
}

export function instancesOn(
  series: Series,
  outcomes: readonly Outcome[],
  date: TemporalTypes.PlainDate,
): SeriesInstance | undefined {
  const moved = movedInstance(outcomes, series.id, date);
  if (!moved && !isScheduled(series, date)) return undefined;
  const outcome = latestOutcome(outcomes, series.id, date);
  const state = instanceState(outcome);
  if (!state) return undefined;
  const time = moved?.newTime ?? series.time;
  return {
    seriesId: series.id,
    date,
    ...(time ? { time } : {}),
    state,
  };
}

export function availableNow(
  instance: SeriesInstance,
  nowTime: TemporalTypes.PlainTime,
): boolean {
  return (
    !instance.time || Temporal.PlainTime.compare(instance.time, nowTime) <= 0
  );
}

function missedOnDate(
  series: Series,
  outcomes: readonly Outcome[],
  date: TemporalTypes.PlainDate,
): MissedInstance | undefined {
  if (!isScheduled(series, date)) return undefined;
  const outcome = latestOutcome(outcomes, series.id, date);
  if (!outcome) return { seriesId: series.id, date, state: 'missed' };
  if (outcome.kind === 'skipped')
    return { seriesId: series.id, date, state: 'skipped' };
  return undefined;
}

export function missed(
  series: Series,
  outcomes: readonly Outcome[],
  today: TemporalTypes.PlainDate,
): MissedInstance[] {
  const entries: MissedInstance[] = [];
  const yesterday = today.subtract({ days: 1 });
  for (
    let date = series.startsOn;
    Temporal.PlainDate.compare(date, yesterday) <= 0;
    date = date.add({ days: 1 })
  ) {
    const entry = missedOnDate(series, outcomes, date);
    if (entry) entries.push(entry);
  }
  const todayOutcome = latestOutcome(outcomes, series.id, today);
  if (todayOutcome?.kind === 'skipped' && isScheduled(series, today)) {
    entries.push({ seriesId: series.id, date: today, state: 'skipped' });
  }
  return entries;
}

export function skipGroups(
  seriesList: readonly Series[],
  outcomes: readonly Outcome[],
  today: TemporalTypes.PlainDate,
): SkipGroup[] {
  return seriesList.flatMap((series) => {
    const dates = missed(series, outcomes, today).map((entry) => entry.date);
    if (dates.length === 0) return [];
    const first = dates[0];
    const last = dates.at(-1);
    if (!first || !last) return [];
    return [{ seriesId: series.id, count: dates.length, dates, first, last }];
  });
}

export function rescheduleInstance(
  series: Series,
  date: TemporalTypes.PlainDate,
  newDate: TemporalTypes.PlainDate,
  newTime: TemporalTypes.PlainTime,
): RescheduleOutcome {
  return { kind: 'rescheduled', seriesId: series.id, date, newDate, newTime };
}
