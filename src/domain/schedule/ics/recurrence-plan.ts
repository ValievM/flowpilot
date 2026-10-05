import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import { eventTimes } from './date-time';
import { allProperties, firstProperty, parseRule } from './event-properties';
import { recurrenceDates, recurrenceKey } from './recurrence-date';
import type { IcsEvent, IcsProperty, ParseOptions } from './types';

export interface RecurrencePlan {
  readonly master: IcsEvent;
  readonly uid: string;
  readonly startProperty: IcsProperty;
  readonly start: TemporalTypes.ZonedDateTime;
  readonly from: TemporalTypes.PlainDate;
  readonly to: TemporalTypes.PlainDate;
  readonly ruleProperty: IcsProperty | undefined;
  readonly rule: ReadonlyMap<string, string>;
  readonly dates: readonly TemporalTypes.PlainDate[];
  readonly excluded: ReadonlySet<string>;
  readonly overrideByStart: ReadonlyMap<string, IcsEvent>;
  readonly count: number;
  readonly timeZone: string;
}

interface RecurrenceIdentity {
  readonly uid: string;
  readonly startProperty: IcsProperty;
  readonly start: TemporalTypes.ZonedDateTime;
}

function identityForMaster(
  master: IcsEvent,
  timeZone: string,
): RecurrenceIdentity {
  const uid = firstProperty(master.properties, 'UID')?.value;
  const startProperty = firstProperty(master.properties, 'DTSTART');
  if (!uid || !startProperty)
    throw new RangeError('Не указаны обязательные UID и DTSTART.');
  const endProperty = firstProperty(master.properties, 'DTEND');
  const duration = firstProperty(master.properties, 'DURATION')?.value;
  if (endProperty && duration)
    throw new RangeError('Нельзя указывать одновременно DTEND и DURATION.');
  const start = eventTimes(
    startProperty,
    endProperty,
    duration,
    timeZone,
  ).start;
  return { uid, startProperty, start };
}

function validateRule(
  property: IcsProperty | undefined,
  rule: ReadonlyMap<string, string>,
): number {
  if (property && rule.get('FREQ') !== 'WEEKLY') {
    throw new RangeError('Поддерживается только FREQ=WEEKLY.');
  }
  const supported = ['FREQ', 'BYDAY', 'UNTIL', 'COUNT', 'INTERVAL'];
  if (
    [...rule.keys()].some((key) => !supported.includes(key)) ||
    (rule.has('COUNT') && rule.has('UNTIL'))
  ) {
    throw new RangeError(
      'Правило повторения содержит неподдерживаемые параметры.',
    );
  }
  const count = Number(rule.get('COUNT') ?? '0');
  if (rule.has('COUNT') && (!Number.isInteger(count) || count < 1)) {
    throw new RangeError('COUNT должен быть положительным целым числом.');
  }
  return count;
}

function exclusionsFor(master: IcsEvent, timeZone: string): Set<string> {
  return new Set(
    allProperties(master.properties, 'EXDATE').flatMap((property) =>
      property.value
        .split(',')
        .map((value) => recurrenceKey({ ...property, value }, timeZone)),
    ),
  );
}

function overridesFor(
  overrides: readonly IcsEvent[],
  timeZone: string,
): Map<string, IcsEvent> {
  return new Map(
    overrides.map((event) => {
      const recurrenceId = firstProperty(event.properties, 'RECURRENCE-ID');
      if (!recurrenceId) throw new RangeError('Не указан RECURRENCE-ID.');
      return [recurrenceKey(recurrenceId, timeZone), event];
    }),
  );
}

export function createRecurrencePlan(
  master: IcsEvent,
  overrides: readonly IcsEvent[],
  options: ParseOptions,
): RecurrencePlan {
  const identity = identityForMaster(master, options.defaultTimeZone);
  const from = options.from ?? identity.start.toPlainDate();
  const to = options.to ?? from.add({ weeks: 8 });
  const ruleProperty = firstProperty(master.properties, 'RRULE');
  const rule = parseRule(ruleProperty);
  const count = validateRule(ruleProperty, rule);
  const dates = ruleProperty
    ? recurrenceDates(identity.start, rule, from, to)
    : [identity.start.toPlainDate()];
  return {
    master,
    ...identity,
    from,
    to,
    ruleProperty,
    rule,
    dates,
    excluded: exclusionsFor(master, options.defaultTimeZone),
    overrideByStart: overridesFor(overrides, options.defaultTimeZone),
    count,
    timeZone: options.defaultTimeZone,
  };
}
