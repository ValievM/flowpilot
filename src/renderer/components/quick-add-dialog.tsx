import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { Series } from '../../domain';
import { submitQuickAdd } from './submit-quick-add';

type SeriesDraft = Omit<Series, 'id'>;

interface QuickAddDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (title: string) => Promise<boolean>;
  readonly onCreateSeries: (series: SeriesDraft) => Promise<boolean>;
  readonly today: Temporal.PlainDate;
  readonly addButtonRef: React.RefObject<HTMLButtonElement | null>;
}
interface RepeatSettingsProps {
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly weekdays: readonly number[];
  readonly onWeekdayToggle: (day: number) => void;
  readonly time: string;
  readonly onTimeChange: (time: string) => void;
  readonly startDate: string;
  readonly onStartDateChange: (date: string) => void;
  readonly endDate: string;
  readonly onEndDateChange: (date: string) => void;
}

function RepeatSettings({
  enabled,
  onEnabledChange,
  weekdays,
  onWeekdayToggle,
  time,
  onTimeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
}: RepeatSettingsProps): React.JSX.Element {
  const labels = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье',
  ];
  return (
    <>
      <label className="repeat-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            onEnabledChange(event.target.checked);
          }}
        />
        Повторять
      </label>
      {enabled && (
        <div className="repeat-create-fields">
          <fieldset>
            <legend>Дни недели</legend>
            {labels.map((day, index) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(index + 1)}
                  onChange={() => {
                    onWeekdayToggle(index + 1);
                  }}
                />
                {day}
              </label>
            ))}
          </fieldset>
          <label htmlFor="repeat-time">Время (необязательно)</label>
          <input
            id="repeat-time"
            type="time"
            value={time}
            onChange={(event) => {
              onTimeChange(event.target.value);
            }}
          />
          <label htmlFor="repeat-start">Начало серии</label>
          <input
            id="repeat-start"
            type="date"
            value={startDate}
            onChange={(event) => {
              onStartDateChange(event.target.value);
            }}
            required
          />
          <label htmlFor="repeat-end">Окончание серии (необязательно)</label>
          <input
            id="repeat-end"
            type="date"
            min={startDate}
            value={endDate}
            onChange={(event) => {
              onEndDateChange(event.target.value);
            }}
          />
        </div>
      )}
    </>
  );
}

export function QuickAddDialog({
  open,
  onClose,
  onSubmit,
  onCreateSeries,
  today,
  addButtonRef,
}: QuickAddDialogProps): React.JSX.Element {
  const todayString = today.toString();
  const [title, setTitle] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [repeatEnabled, setRepeatEnabled] = React.useState(false);
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [time, setTime] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      dialogRef.current?.querySelector('input')?.focus();
    } else if (dialogRef.current?.open) {
      dialogRef.current.close();
      addButtonRef.current?.focus();
    }
  }, [open, addButtonRef]);
  const closeDialog = (): void => {
    setStartDate('');
    onClose();
  };
  const toggleWeekday = (day: number): void => {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort(),
    );
  };
  const submitTask = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    void submitQuickAdd(event, {
      title,
      submitting,
      repeatEnabled,
      weekdays,
      time,
      startDate: startDate || todayString,
      endDate,
      onSubmit,
      onCreateSeries,
      setTitle,
      setSubmitting,
      setError,
      setRepeatEnabled,
      setWeekdays,
      setTime,
      setEndDate,
      closeDialog,
      addButtonRef,
    });
  };

  return (
    <dialog
      className="quick-dialog"
      ref={dialogRef}
      aria-labelledby="quick-title"
      onClose={() => {
        onClose();
        addButtonRef.current?.focus();
      }}
    >
      <div className="dialog-heading">
        <h2 id="quick-title">Новая задача</h2>
        <button
          className="button icon-button"
          type="button"
          aria-label="Закрыть"
          onClick={closeDialog}
        >
          ×
        </button>
      </div>
      <form onSubmit={submitTask}>
        <label htmlFor="new-task-title">Что нужно сделать?</label>
        <input
          id="new-task-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(undefined);
          }}
          placeholder="Например, подготовить вопросы к семинару"
          required
          autoComplete="off"
          aria-describedby="new-task-help"
        />
        <p className="helper-text" id="new-task-help">
          Задача сохранится в «Сделать» на сегодня. Срок и подробности можно
          добавить позже.
        </p>
        <RepeatSettings
          enabled={repeatEnabled}
          onEnabledChange={setRepeatEnabled}
          weekdays={weekdays}
          onWeekdayToggle={toggleWeekday}
          time={time}
          onTimeChange={setTime}
          startDate={startDate || todayString}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button"
            type="button"
            onClick={closeDialog}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={
              !title.trim() ||
              submitting ||
              (repeatEnabled && weekdays.length === 0)
            }
          >
            {submitting
              ? 'Сохраняем…'
              : repeatEnabled
                ? 'Создать серию'
                : 'Добавить задачу'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
