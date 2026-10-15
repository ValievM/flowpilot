import React from 'react';
import { RepeatEditor } from './repeat-editor';
import { MissedGroups } from './missed-repeat-groups';
import { Temporal } from 'temporal-polyfill';
import {
  availableNow,
  instancesOn,
  rescheduleInstance,
  skipGroups,
} from '../../domain/repeats';
import type { Outcome, RescheduleOutcome, Series } from '../../domain';
import type { CommandsApplyRequest } from '../../shared/contracts';

type Commands = CommandsApplyRequest['commands'];
type OutcomeInput = Extract<
  Commands[number],
  { kind: 'series.recordOutcome' }
>['outcome'];
type SeriesChanges = Extract<
  Commands[number],
  { kind: 'series.update' }
>['changes'];

interface RepeatPanelProps {
  readonly series: readonly Series[];
  readonly outcomes: readonly Outcome[];
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.PlainTime;
  readonly showNow: boolean;
  readonly onOutcome: (seriesId: string, outcome: OutcomeInput) => void;
  readonly onUpdate: (seriesId: string, changes: SeriesChanges) => void;
  readonly onStop: (seriesId: string, endDate: Temporal.PlainDate) => void;
  readonly onReschedule: (seriesId: string, outcome: RescheduleOutcome) => void;
}

function RepeatInstance({
  series,
  date,
  time,
  state,
  onOutcome,
  onOpenEditor,
  onReschedule,
}: {
  readonly series: Series;
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime | undefined;
  readonly state: 'pending' | 'done' | 'skipped';
  readonly onOutcome: RepeatPanelProps['onOutcome'];
  readonly onOpenEditor: () => void;
  readonly onReschedule: RepeatPanelProps['onReschedule'];
}): React.JSX.Element {
  const [newDate, setNewDate] = React.useState('');
  const [newTime, setNewTime] = React.useState('');
  const record = (kind: 'done' | 'skipped'): void => {
    onOutcome(series.id, { kind, date });
  };
  const move = (): void => {
    if (!newDate || !newTime) return;
    onReschedule(
      series.id,
      rescheduleInstance(
        series,
        date,
        Temporal.PlainDate.from(newDate),
        Temporal.PlainTime.from(newTime),
      ),
    );
    setNewDate('');
    setNewTime('');
  };
  return (
    <li className="repeat-instance">
      <div className="repeat-instance-heading">
        <button
          className="repeat-title-button"
          type="button"
          onClick={onOpenEditor}
        >
          {series.title}
        </button>
        <span>
          {time
            ? ` · ${time.toString({ smallestUnit: 'minute' })}`
            : ' · Без времени'}
        </span>
        <span className="repeat-state">
          {state === 'pending'
            ? '○ Запланировано'
            : state === 'done'
              ? '✓ Выполнено'
              : '↷ Пропуск'}
        </span>
      </div>
      {state === 'pending' && (
        <div className="repeat-actions">
          <button
            className="button"
            type="button"
            onClick={() => {
              record('done');
            }}
          >
            Выполнено
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              record('skipped');
            }}
          >
            Пропустить
          </button>
        </div>
      )}
      {state === 'pending' && time && (
        <details className="repeat-reschedule">
          <summary>Перенести</summary>
          <label htmlFor={`repeat-date-${series.id}`}>Новая дата</label>
          <input
            id={`repeat-date-${series.id}`}
            type="date"
            value={newDate}
            onChange={(event) => {
              setNewDate(event.target.value);
            }}
          />
          <label htmlFor={`repeat-time-${series.id}`}>Новое время</label>
          <input
            id={`repeat-time-${series.id}`}
            type="time"
            value={newTime}
            onChange={(event) => {
              setNewTime(event.target.value);
            }}
          />
          <button
            className="button"
            type="button"
            disabled={!newDate || !newTime}
            onClick={move}
          >
            Подтвердить перенос
          </button>
        </details>
      )}
      <span className="repeat-date">
        {date.toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}
      </span>
    </li>
  );
}

export function RepeatPanel(props: RepeatPanelProps): React.JSX.Element | null {
  const [editingId, setEditingId] = React.useState<string>();
  const instances = props.series.flatMap((series) => {
    const instance = instancesOn(series, props.outcomes, props.today);
    if (!instance || (!props.showNow && instance.state === 'skipped'))
      return [];
    if (
      props.showNow &&
      (instance.state !== 'pending' || !availableNow(instance, props.now))
    )
      return [];
    return [{ series, instance }];
  });
  const editing = props.series.find(({ id }) => id === editingId);
  if (
    instances.length === 0 &&
    (props.showNow ||
      skipGroups(props.series, props.outcomes, props.today).length === 0)
  )
    return null;
  return (
    <section className="repeat-panel" aria-labelledby="repeat-panel-title">
      <h2 id="repeat-panel-title">
        Повторы {props.showNow ? 'сейчас' : 'сегодня'}
      </h2>
      {instances.length > 0 && (
        <ul className="repeat-instances">
          {instances.map(({ series, instance }) => (
            <RepeatInstance
              key={series.id}
              series={series}
              date={instance.date}
              time={instance.time}
              state={instance.state}
              onOutcome={(id, outcome) => {
                props.onOutcome(id, outcome);
              }}
              onOpenEditor={() => {
                setEditingId(series.id);
              }}
              onReschedule={props.onReschedule}
            />
          ))}
        </ul>
      )}
      {editing && (
        <RepeatEditor
          key={editing.id}
          series={editing}
          today={props.today}
          onUpdate={(id, changes) => {
            props.onUpdate(id, changes);
            setEditingId(undefined);
          }}
          onStop={props.onStop}
        />
      )}
      {!props.showNow && (
        <MissedGroups
          series={props.series}
          outcomes={props.outcomes}
          today={props.today}
          onOutcome={props.onOutcome}
        />
      )}
    </section>
  );
}
