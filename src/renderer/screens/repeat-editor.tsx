import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { Series } from '../../domain';
import type { CommandsApplyRequest } from '../../shared/contracts';

type Commands = CommandsApplyRequest['commands'];
type SeriesChanges = Extract<
  Commands[number],
  { kind: 'series.update' }
>['changes'];
type UpdateSeries = (seriesId: string, changes: SeriesChanges) => void;
type StopSeries = (seriesId: string, endDate: Temporal.PlainDate) => void;

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function RepeatEditor({
  series,
  today,
  onUpdate,
  onStop,
}: {
  readonly series: Series;
  readonly today: Temporal.PlainDate;
  readonly onUpdate: UpdateSeries;
  readonly onStop: StopSeries;
}): React.JSX.Element {
  const [title, setTitle] = React.useState(series.title);
  const [days, setDays] = React.useState<number[]>([...series.weekdays]);
  const [time, setTime] = React.useState(
    series.time?.toString({ smallestUnit: 'minute' }) ?? '',
  );
  const toggleDay = (day: number): void => {
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort(),
    );
  };
  const save = (): void => {
    if (!title.trim() || days.length === 0) return;
    onUpdate(series.id, {
      title: title.trim(),
      weekdays: days,
      time: time ? Temporal.PlainTime.from(time) : null,
    });
  };
  return (
    <form
      className="repeat-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h3>Параметры серии</h3>
      <label htmlFor="repeat-editor-title">Название</label>
      <input
        id="repeat-editor-title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
      <fieldset>
        <legend>Дни недели</legend>
        {weekdays.map((label, index) => (
          <label key={label}>
            <input
              type="checkbox"
              checked={days.includes(index + 1)}
              onChange={() => {
                toggleDay(index + 1);
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label htmlFor="repeat-editor-time">Время</label>
      <input
        id="repeat-editor-time"
        type="time"
        value={time}
        onChange={(event) => {
          setTime(event.target.value);
        }}
      />
      <div className="repeat-actions">
        <button
          className="button"
          type="submit"
          disabled={!title.trim() || days.length === 0}
        >
          Сохранить серию
        </button>
        <button
          className="button"
          type="button"
          onClick={() => {
            onStop(series.id, today);
          }}
        >
          Остановить серию
        </button>
      </div>
    </form>
  );
}
