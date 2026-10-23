import React from 'react';
import { draftProblem, type ManualDraft } from '../schedule/manual-event-draft';

const WEEKDAYS = [
  [1, 'Пн'],
  [2, 'Вт'],
  [3, 'Ср'],
  [4, 'Чт'],
  [5, 'Пт'],
  [6, 'Сб'],
  [7, 'Вс'],
] as const;

interface ManualEventFormProps {
  readonly initial: ManualDraft;
  readonly submitLabel: string;
  readonly onSubmit: (draft: ManualDraft) => Promise<boolean>;
  readonly onCancel: () => void;
}

export function ManualEventForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: ManualEventFormProps): React.JSX.Element {
  const [draft, setDraft] = React.useState(initial);
  const [problem, setProblem] = React.useState<string>();
  const change = (patch: Partial<ManualDraft>): void => {
    setDraft({ ...draft, ...patch });
  };
  const submit = async (): Promise<void> => {
    const found = draftProblem(draft);
    setProblem(found);
    if (!found) await onSubmit(draft);
  };
  return (
    <form
      className="manual-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label>
        Название занятия
        <input
          value={draft.title}
          onChange={(event) => {
            change({ title: event.target.value });
          }}
        />
      </label>
      <fieldset>
        <legend>Дни недели</legend>
        {WEEKDAYS.map(([day, label]) => (
          <label key={day}>
            <input
              type="checkbox"
              checked={draft.weekdays.includes(day)}
              onChange={(event) => {
                change({
                  weekdays: event.target.checked
                    ? [...draft.weekdays, day]
                    : draft.weekdays.filter((item) => item !== day),
                });
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="manual-times">
        <label>
          Начало
          <input
            type="time"
            value={draft.startTime}
            onChange={(event) => {
              change({ startTime: event.target.value });
            }}
          />
        </label>
        <label>
          Конец
          <input
            type="time"
            value={draft.endTime}
            onChange={(event) => {
              change({ endTime: event.target.value });
            }}
          />
        </label>
      </div>
      <label>
        Место (необязательно)
        <input
          value={draft.place}
          onChange={(event) => {
            change({ place: event.target.value });
          }}
        />
      </label>
      <div className="manual-times">
        <label>
          Первый день
          <input
            type="date"
            value={draft.fromDate}
            onChange={(event) => {
              change({ fromDate: event.target.value });
            }}
          />
        </label>
        <label>
          Последний день
          <input
            type="date"
            value={draft.throughDate}
            onChange={(event) => {
              change({ throughDate: event.target.value });
            }}
          />
        </label>
      </div>
      {problem && (
        <p role="alert" className="settings-error">
          {problem}
        </p>
      )}
      <div className="manual-actions">
        <button className="button button-primary" type="submit">
          {submitLabel}
        </button>
        <button className="button" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}
