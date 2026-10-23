import { Temporal } from 'temporal-polyfill';

/**
 * Temporal values are class instances backed by hidden slots, so Electron's
 * structured clone turns them into empty objects. Everything that crosses IPC
 * must be plain data.
 */
export function toPlain(value: unknown): unknown {
  if (
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return value.toString();
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toPlain(entry)]),
    );
  }
  return value;
}
