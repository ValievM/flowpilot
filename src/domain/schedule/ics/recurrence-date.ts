import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import { dateTimeValue } from './date-time';
import type { IcsProperty } from './types';

const DAY_CODES: Readonly<Record<string, number>> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

export function startKey(start: TemporalTypes.ZonedDateTime): string {
  return start.toInstant().toString();
}

export function recurrenceKey(property: IcsProperty, zone: string): string {
  return dateTimeValue(property, zone).toInstant().toString();
}

export function withinWindow(
  start: TemporalTypes.ZonedDateTime,
  from: TemporalTypes.PlainDate,
  to: TemporalTypes.PlainDate,
): boolean {
  const date = start.toPlainDate();
  return (
    Temporal.PlainDate.compare(date, from) >= 0 &&
    Temporal.PlainDate.compare(date, to) <= 0
  );
}

function intervalOf(rule: ReadonlyMap<string, string>): number {
  const interval = Number(rule.get('INTERVAL') ?? '1');
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RangeError('INTERVAL должен быть положительным целым числом.');
  }
  return interval;
}

function weekdaysOf(
  rule: ReadonlyMap<string, string>,
  start: TemporalTypes.ZonedDateTime,
): number[] {
  const namedDays = rule.get('BYDAY')?.split(',') ?? [
    Object.keys(DAY_CODES).find((day) => DAY_CODES[day] === start.dayOfWeek) ??
      '',
  ];
  const days = namedDays.map((day) => DAY_CODES[day]);
  if (days.some((day) => day === undefined) || days.length === 0) {
    throw new RangeError(
      'Поддерживаются только дни недели BYDAY без порядкового номера.',
    );
  }
  return days.filter((day): day is number => day !== undefined);
}

function matchesWeeklyDate(
  date: TemporalTypes.PlainDate,
  startWeek: TemporalTypes.PlainDate,
  interval: number,
  weekdays: readonly number[],
): boolean {
  const weekStart = date.subtract({ days: date.dayOfWeek - 1 });
  const weekNumber = Math.floor(startWeek.until(weekStart).days / 7);
  return weekNumber % interval === 0 && weekdays.includes(date.dayOfWeek);
}

function includeStartDate(
  dates: TemporalTypes.PlainDate[],
  start: TemporalTypes.PlainDate,
  end: TemporalTypes.PlainDate,
): void {
  const isIncluded = dates.some((date) => date.equals(start));
  if (!isIncluded && Temporal.PlainDate.compare(start, end) <= 0)
    dates.unshift(start);
}

export function recurrenceDates(
  start: TemporalTypes.ZonedDateTime,
  rule: ReadonlyMap<string, string>,
  end: TemporalTypes.PlainDate,
): TemporalTypes.PlainDate[] {
  const interval = intervalOf(rule);
  const weekdays = weekdaysOf(rule, start);
  const firstDate = start.toPlainDate();
  const startWeek = firstDate.subtract({ days: start.dayOfWeek - 1 });
  const dates: TemporalTypes.PlainDate[] = [];
  let scanned = 0;
  for (
    let date = firstDate;
    Temporal.PlainDate.compare(date, end) <= 0;
    date = date.add({ days: 1 })
  ) {
    if (++scanned > 5_000)
      throw new RangeError('Превышена глубина развёртки 5000 событий.');
    if (matchesWeeklyDate(date, startWeek, interval, weekdays))
      dates.push(date);
  }
  includeStartDate(dates, firstDate, end);
  return dates;
}

export function startOnDate(
  start: TemporalTypes.ZonedDateTime,
  date: TemporalTypes.PlainDate,
): TemporalTypes.ZonedDateTime {
  return date
    .toPlainDateTime(start.toPlainTime())
    .toZonedDateTime(start.timeZoneId, { disambiguation: 'compatible' });
}

export function untilAllows(
  until: string | undefined,
  start: TemporalTypes.ZonedDateTime,
): boolean {
  if (!until) return true;
  const property: IcsProperty = {
    name: 'UNTIL',
    params: {},
    value: until,
    line: 0,
  };
  return (
    Temporal.ZonedDateTime.compare(
      start,
      dateTimeValue(property, start.timeZoneId),
    ) <= 0
  );
}

export function endForOccurrence(
  property: IcsProperty,
  originalStart: TemporalTypes.ZonedDateTime,
  occurrenceStart: TemporalTypes.ZonedDateTime,
  timeZone: string,
): IcsProperty {
  const originalEnd = dateTimeValue(property, timeZone);
  const dayOffset = originalStart
    .toPlainDate()
    .until(originalEnd.toPlainDate()).days;
  const endDate = occurrenceStart
    .toPlainDate()
    .add({ days: dayOffset })
    .toString()
    .replace(/-/g, '');
  if (property.params.VALUE === 'DATE') return { ...property, value: endDate };
  return { ...property, value: `${endDate}T${property.value.slice(9)}` };
}
