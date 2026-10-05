import type { Temporal } from 'temporal-polyfill';

export interface Series {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly weekdays: readonly number[];
  readonly time?: Temporal.PlainTime;
  readonly startsOn: Temporal.PlainDate;
  readonly endsOn?: Temporal.PlainDate;
}

export type Outcome =
  | {
      readonly kind: 'done' | 'skipped' | 'dismissed';
      readonly seriesId: string;
      readonly date: Temporal.PlainDate;
      readonly recordedAt: Temporal.Instant;
    }
  | {
      readonly kind: 'rescheduled';
      readonly seriesId: string;
      readonly date: Temporal.PlainDate;
      readonly newDate: Temporal.PlainDate;
      readonly newTime: Temporal.PlainTime;
      readonly recordedAt: Temporal.Instant;
    };

export interface SeriesInstance {
  readonly seriesId: string;
  readonly date: Temporal.PlainDate;
  readonly time?: Temporal.PlainTime;
  readonly state: 'pending' | 'done' | 'skipped';
}

export interface MissedInstance {
  readonly seriesId: string;
  readonly date: Temporal.PlainDate;
  readonly state: 'missed' | 'skipped';
}

export interface SkipGroup {
  readonly seriesId: string;
  readonly count: number;
  readonly dates: readonly Temporal.PlainDate[];
  readonly first: Temporal.PlainDate;
  readonly last: Temporal.PlainDate;
}

export interface RescheduleOutcome {
  readonly kind: 'rescheduled';
  readonly seriesId: string;
  readonly date: Temporal.PlainDate;
  readonly newDate: Temporal.PlainDate;
  readonly newTime: Temporal.PlainTime;
}
