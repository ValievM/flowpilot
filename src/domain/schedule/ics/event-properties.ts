import type { FixedEvent } from '../fixed-events';
import { eventTimes } from './date-time';
import { unescapeText } from './content-lines';
import type { IcsEvent, IcsProperty } from './types';

export function firstProperty(
  properties: readonly IcsProperty[],
  name: string,
): IcsProperty | undefined {
  return properties.find((property) => property.name === name);
}

export function allProperties(
  properties: readonly IcsProperty[],
  name: string,
): readonly IcsProperty[] {
  return properties.filter((property) => property.name === name);
}

export function parseRule(
  property: IcsProperty | undefined,
): Map<string, string> {
  return new Map(
    (property?.value ?? '')
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf('=');
        return [
          pair.slice(0, separator).toUpperCase(),
          pair.slice(separator + 1).toUpperCase(),
        ];
      }),
  );
}

export function makeEvent(
  source: IcsEvent,
  startProperty: IcsProperty,
  key: string,
  timeZone: string,
): FixedEvent {
  const times = eventTimes(
    startProperty,
    firstProperty(source.properties, 'DTEND'),
    firstProperty(source.properties, 'DURATION')?.value,
    timeZone,
  );
  const summary = firstProperty(source.properties, 'SUMMARY');
  const place = firstProperty(source.properties, 'LOCATION');
  const status = firstProperty(
    source.properties,
    'STATUS',
  )?.value.toUpperCase();
  return {
    key,
    source: 'ics',
    title: summary ? unescapeText(summary.value) : '(без названия)',
    start: times.start,
    end: times.end,
    ...(place ? { place: unescapeText(place.value) } : {}),
    ...(status === 'CANCELLED' ? { cancelled: true } : {}),
  };
}
