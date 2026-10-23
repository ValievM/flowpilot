import { Temporal } from 'temporal-polyfill';
import type { FixedEvent } from '../../domain/schedule/fixed-events';
import type { SourceView } from './schedule-model';

const sourceNames = {
  modeus: 'Modeus',
  ics: 'Файл .ics',
  manual: 'Ручные занятия',
} as const;

export function sourceName(source: SourceView['source']): string {
  return sourceNames[source];
}

function clock(value: Temporal.ZonedDateTime): string {
  return value.toPlainTime().toString({ smallestUnit: 'minute' });
}

/** How old a snapshot is, in words: "сегодня, 12:50", "вчера, 09:10", "3 октября, 18:00". */
export function ageText(
  fetchedAt: Temporal.ZonedDateTime,
  now: Temporal.ZonedDateTime,
): string {
  const days = now.toPlainDate().since(fetchedAt.toPlainDate()).days;
  if (days <= 0) return `сегодня, ${clock(fetchedAt)}`;
  if (days === 1) return `вчера, ${clock(fetchedAt)}`;
  const date = fetchedAt.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  return `${date}, ${clock(fetchedAt)}`;
}

export function eventTime(event: FixedEvent): string {
  return `${clock(event.start)} — ${clock(event.end)}`;
}
