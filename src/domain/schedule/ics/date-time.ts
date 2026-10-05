import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { IcsProperty } from './types';

export interface EventTimes {
  readonly start: TemporalTypes.ZonedDateTime;
  readonly end: TemporalTypes.ZonedDateTime;
  readonly allDay: boolean;
}

function localDateTime(value: string): TemporalTypes.PlainDateTime {
  const normalized = value.endsWith('Z') ? value.slice(0, -1) : value;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(
    normalized,
  );
  if (!match) throw new RangeError('Некорректное значение даты и времени.');
  return Temporal.PlainDateTime.from({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? '0'),
  });
}

export function dateTimeValue(
  property: IcsProperty,
  defaultTimeZone: string,
): TemporalTypes.ZonedDateTime {
  const zone = property.value.endsWith('Z')
    ? 'UTC'
    : (property.params.TZID ?? defaultTimeZone);
  if (property.params.VALUE === 'DATE' || /^\d{8}$/.test(property.value)) {
    const date = Temporal.PlainDate.from({
      year: Number(property.value.slice(0, 4)),
      month: Number(property.value.slice(4, 6)),
      day: Number(property.value.slice(6, 8)),
    });
    return date.toPlainDateTime().toZonedDateTime(zone);
  }
  return localDateTime(property.value).toZonedDateTime(zone, {
    disambiguation: 'compatible',
  });
}

export function eventTimes(
  startProperty: IcsProperty,
  endProperty: IcsProperty | undefined,
  duration: string | undefined,
  defaultTimeZone: string,
): EventTimes {
  const allDay =
    startProperty.params.VALUE === 'DATE' ||
    /^\d{8}$/.test(startProperty.value);
  const start = dateTimeValue(startProperty, defaultTimeZone);
  if (allDay) {
    const endDate = endProperty
      ? Temporal.PlainDate.from(endProperty.value)
      : start
          .toPlainDate()
          .add(duration ? Temporal.Duration.from(duration) : { days: 1 });
    if (Temporal.PlainDate.compare(endDate, start.toPlainDate()) <= 0) {
      throw new RangeError('Время окончания должно быть позже начала.');
    }
    return {
      start,
      end: endDate.toPlainDateTime().toZonedDateTime(start.timeZoneId),
      allDay,
    };
  }
  const end = endProperty
    ? dateTimeValue(endProperty, defaultTimeZone)
    : start.add(Temporal.Duration.from(duration ?? 'PT0S'));
  if (Temporal.ZonedDateTime.compare(end, start) <= 0) {
    throw new RangeError('Время окончания должно быть позже начала.');
  }
  return { start, end, allDay };
}
