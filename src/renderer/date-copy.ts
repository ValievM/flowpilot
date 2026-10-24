import { Temporal } from 'temporal-polyfill';

/** The one way a calendar date is written on every screen: 09.10.2026. */
export function formatDate(value: string | Temporal.PlainDate): string {
  return Temporal.PlainDate.from(value).toLocaleString('ru-RU');
}
