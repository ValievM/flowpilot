import type { CommandsApplyRequest, IpcSnapshot } from '../../shared/contracts';

type Command = CommandsApplyRequest['commands'][number];
type SerializedSeries = IpcSnapshot['series'][number];
type SerializedOutcome = IpcSnapshot['outcomes'][number];
const RECORDED_AT = '2026-10-05T12:00:00Z';

function optionalField<K extends keyof SerializedSeries>(
  key: K,
  value: SerializedSeries[K] | undefined,
): Partial<Pick<SerializedSeries, K>> {
  return value === undefined
    ? {}
    : ({ [key]: value } as Pick<SerializedSeries, K>);
}

function updatedOptional<T, U>(
  current: U | undefined,
  change: T | null | undefined,
  serialize: (value: T) => U,
): U | undefined {
  if (change === null) return undefined;
  return change === undefined ? current : serialize(change);
}

function serializedSeries(
  command: Extract<Command, { kind: 'series.create' }>['series'],
): SerializedSeries {
  return {
    id: command.id,
    title: command.title,
    weekdays: [...command.weekdays],
    startsOn: command.startsOn.toString(),
    ...optionalField('description', command.description),
    ...optionalField('endsOn', command.endsOn?.toString()),
    ...optionalField('time', command.time?.toString()),
  };
}

function updatedSeries(
  current: SerializedSeries,
  changes: Extract<Command, { kind: 'series.update' }>['changes'],
): SerializedSeries {
  const { description, endsOn, time, ...base } = current;
  return {
    ...base,
    ...optionalField('title', changes.title),
    ...optionalField(
      'description',
      updatedOptional(description, changes.description, (value) => value),
    ),
    ...optionalField(
      'weekdays',
      changes.weekdays ? [...changes.weekdays] : undefined,
    ),
    ...optionalField('startsOn', changes.startsOn?.toString()),
    ...optionalField(
      'endsOn',
      updatedOptional(endsOn, changes.endsOn, (value) => value.toString()),
    ),
    ...optionalField(
      'time',
      updatedOptional(time, changes.time, (value) => value.toString()),
    ),
  };
}

function serializeOutcome(
  command: Extract<Command, { kind: 'series.recordOutcome' }>,
): SerializedOutcome {
  const { outcome } = command;
  return outcome.kind === 'rescheduled'
    ? {
        seriesId: command.seriesId,
        ...outcome,
        date: outcome.date.toString(),
        newDate: outcome.newDate.toString(),
        newTime: outcome.newTime.toString(),
        recordedAt: RECORDED_AT,
      }
    : {
        seriesId: command.seriesId,
        ...outcome,
        date: outcome.date.toString(),
        recordedAt: RECORDED_AT,
      };
}

function updateSeries(
  series: readonly SerializedSeries[],
  id: string,
  changes: Extract<Command, { kind: 'series.update' }>['changes'],
): readonly SerializedSeries[] {
  const index = series.findIndex((item) => item.id === id);
  const current = series[index];
  if (!current) return series;
  const next = [...series];
  next[index] = updatedSeries(current, changes);
  return next;
}

function stopSeries(
  series: readonly SerializedSeries[],
  id: string,
  endDate: Extract<Command, { kind: 'series.stop' }>['endDate'],
): readonly SerializedSeries[] {
  const index = series.findIndex((item) => item.id === id);
  const current = series[index];
  if (!current) return series;
  const next = [...series];
  next[index] = { ...current, endsOn: endDate.toString() };
  return next;
}

function applySeriesCommand(
  series: readonly SerializedSeries[],
  command: Command,
): readonly SerializedSeries[] {
  switch (command.kind) {
    case 'series.create':
      return [...series, serializedSeries(command.series)];
    case 'series.update':
      return updateSeries(series, command.id, command.changes);
    case 'series.stop':
      return stopSeries(series, command.id, command.endDate);
    default:
      return series;
  }
}

function recordOutcome(
  outcomes: readonly SerializedOutcome[],
  command: Extract<Command, { kind: 'series.recordOutcome' }>,
): readonly SerializedOutcome[] {
  const nextOutcome = serializeOutcome(command);
  const index = outcomes.findIndex(
    (item) =>
      item.seriesId === nextOutcome.seriesId && item.date === nextOutcome.date,
  );
  if (index < 0) return [...outcomes, nextOutcome];
  const next = [...outcomes];
  next[index] = nextOutcome;
  return next;
}

export function applyRepeatCommands(
  snapshot: IpcSnapshot,
  commands: CommandsApplyRequest['commands'],
): Pick<IpcSnapshot, 'series' | 'outcomes'> {
  let series: readonly SerializedSeries[] = snapshot.series;
  let outcomes: readonly SerializedOutcome[] = snapshot.outcomes;
  for (const command of commands) {
    series = applySeriesCommand(series, command);
    if (command.kind === 'series.recordOutcome')
      outcomes = recordOutcome(outcomes, command);
  }
  return { series, outcomes };
}
