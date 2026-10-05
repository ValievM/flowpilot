import { Temporal } from 'temporal-polyfill';

export function dateText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime
  )
    return value.toString();
  throw new Error('Date and time values must be strings or Temporal values');
}

export function timeText(value: unknown): string | null {
  return dateText(value);
}
