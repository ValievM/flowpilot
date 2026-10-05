import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { FixedEvent } from '../fixed-events';

export interface ParseOptions {
  readonly defaultTimeZone: string;
  readonly from?: TemporalTypes.PlainDate;
  readonly to?: TemporalTypes.PlainDate;
}

export interface ParseProblem {
  readonly line: number;
  readonly reason: string;
}

export interface ParseResult {
  readonly events: readonly FixedEvent[];
  readonly problems: readonly ParseProblem[];
}

export interface IcsProperty {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
  readonly value: string;
  readonly line: number;
}

export interface IcsEvent {
  readonly properties: readonly IcsProperty[];
  readonly line: number;
}
