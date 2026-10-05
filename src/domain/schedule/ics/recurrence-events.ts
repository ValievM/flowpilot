import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { FixedEvent } from '../fixed-events';
import { firstProperty, makeEvent } from './event-properties';
import {
  endForOccurrence,
  recurrenceOrdinal,
  startKey,
  startOnDate,
  untilAllows,
  withinWindow,
} from './recurrence-date';
import type { RecurrencePlan } from './recurrence-plan';
import type { IcsEvent, IcsProperty } from './types';

function propertyForOccurrence(
  property: IcsProperty,
  start: TemporalTypes.ZonedDateTime,
): IcsProperty {
  const date = start.toPlainDate().toString().replace(/-/g, '');
  const time = start
    .toPlainTime()
    .toString({ smallestUnit: 'second' })
    .replace(/:/g, '');
  const value =
    property.params.VALUE === 'DATE'
      ? date
      : `${date}T${time}${property.value.endsWith('Z') ? 'Z' : ''}`;
  return { ...property, value };
}

function updatedEvent(
  plan: RecurrencePlan,
  override: IcsEvent | undefined,
  start: TemporalTypes.ZonedDateTime,
): IcsEvent {
  if (override) return override;
  if (!plan.ruleProperty || !firstProperty(plan.master.properties, 'DTEND'))
    return plan.master;
  return {
    ...plan.master,
    properties: plan.master.properties.map((property) =>
      property.name === 'DTEND'
        ? endForOccurrence(property, plan.start, start, plan.timeZone)
        : property,
    ),
  };
}

function eventStart(
  plan: RecurrencePlan,
  source: IcsEvent,
  override: IcsEvent | undefined,
  start: TemporalTypes.ZonedDateTime,
): IcsProperty {
  if (override) {
    const property = firstProperty(source.properties, 'DTSTART');
    if (property) return property;
    throw new RangeError('Переопределение без DTSTART.');
  }
  return plan.ruleProperty
    ? propertyForOccurrence(plan.startProperty, start)
    : plan.startProperty;
}

function eventForDate(
  plan: RecurrencePlan,
  date: TemporalTypes.PlainDate,
): FixedEvent | undefined {
  if (
    plan.count > 0 &&
    recurrenceOrdinal(plan.start, date, plan.rule) > plan.count
  )
    return undefined;
  const start = startOnDate(plan.start, date);
  if (
    !untilAllows(plan.rule.get('UNTIL'), start) ||
    !withinWindow(start, plan.from, plan.to)
  )
    return undefined;
  const key = startKey(start);
  const override = plan.overrideByStart.get(key);
  if (plan.excluded.has(key) && !override) return undefined;
  const source = updatedEvent(plan, override, start);
  return makeEvent(
    source,
    eventStart(plan, source, override, start),
    `${plan.uid}:${date.toString()}`,
    plan.timeZone,
  );
}

export function materializeRecurrence(plan: RecurrencePlan): FixedEvent[] {
  return plan.dates.flatMap((date) => {
    const event = eventForDate(plan, date);
    return event ? [event] : [];
  });
}
