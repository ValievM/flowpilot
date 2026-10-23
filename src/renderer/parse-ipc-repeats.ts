import { Temporal } from 'temporal-polyfill';
import type { Outcome, Series } from '../domain';
import type { IpcSnapshot } from '../shared/contracts';

export function parsedSeries(snapshot: IpcSnapshot | undefined): {
  readonly series: readonly Series[];
  readonly outcomes: readonly Outcome[];
} {
  if (!snapshot) return { series: [], outcomes: [] };
  return {
    series: snapshot.series.map(({ startsOn, endsOn, time, ...series }) => ({
      ...series,
      startsOn: Temporal.PlainDate.from(startsOn),
      ...(endsOn ? { endsOn: Temporal.PlainDate.from(endsOn) } : {}),
      ...(time ? { time: Temporal.PlainTime.from(time) } : {}),
    })),
    outcomes: snapshot.outcomes.map((outcome) =>
      outcome.kind === 'rescheduled'
        ? {
            ...outcome,
            date: Temporal.PlainDate.from(outcome.date),
            newDate: Temporal.PlainDate.from(outcome.newDate),
            newTime: Temporal.PlainTime.from(outcome.newTime),
            recordedAt: Temporal.Instant.from(outcome.recordedAt),
          }
        : {
            ...outcome,
            date: Temporal.PlainDate.from(outcome.date),
            recordedAt: Temporal.Instant.from(outcome.recordedAt),
          },
    ),
  };
}
