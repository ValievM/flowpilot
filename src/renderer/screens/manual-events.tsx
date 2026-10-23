import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { CommandsApplyRequest } from '../../shared/contracts';
import type { ManualScheduleEvent } from '../../shared/schedule-contracts';
import {
  draftOf,
  emptyDraft,
  eventOf,
  type ManualDraft,
} from '../schedule/manual-event-draft';
import { useSchedule } from '../schedule/schedule-context';
import { ManualEventForm } from './manual-event-form';

type Commands = CommandsApplyRequest['commands'];
const DAY_NAMES = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

interface ManualEventsProps {
  readonly today: Temporal.PlainDate;
  readonly onApply: (commands: Commands) => Promise<boolean>;
}

function describe(event: ManualScheduleEvent): string {
  const days = event.weekdays.map((day) => DAY_NAMES[day - 1] ?? '').join(', ');
  const place = event.place ? ` · ${event.place}` : '';
  return `${days} · ${event.startTime}–${event.endTime}${place}`;
}

export function ManualEvents({
  today,
  onApply,
}: ManualEventsProps): React.JSX.Element {
  const { snapshots, reload } = useSchedule();
  const events = (snapshots.find(({ source }) => source === 'manual')?.events ??
    []) as readonly ManualScheduleEvent[];
  const [editing, setEditing] = React.useState<string>();
  const run = async (commands: Commands): Promise<boolean> => {
    const saved = await onApply(commands);
    if (saved) {
      await reload();
      setEditing(undefined);
    }
    return saved;
  };
  const at = (): string => Temporal.Now.instant().toString();
  const save = (draft: ManualDraft): Promise<boolean> =>
    editing === 'new' || editing === undefined
      ? run([
          {
            kind: 'schedule.manual.add',
            event: eventOf(draft, crypto.randomUUID()),
            at: at(),
          },
        ])
      : run([
          {
            kind: 'schedule.manual.update',
            id: editing,
            event: eventOf(draft, editing),
            at: at(),
          },
        ]);
  const current = events.find(({ id }) => id === editing);
  return (
    <div className="manual-events">
      <h3>Ручные занятия</h3>
      {events.length === 0 && <p>Своих занятий пока нет.</p>}
      <ul>
        {events.map((event) => (
          <li key={event.id}>
            <span>
              <strong>{event.title}</strong> · {describe(event)}
            </span>
            <button
              className="button"
              type="button"
              aria-label={`Изменить занятие: ${event.title}`}
              onClick={() => {
                setEditing(event.id);
              }}
            >
              Изменить
            </button>
            <button
              className="button"
              type="button"
              aria-label={`Удалить занятие: ${event.title}`}
              onClick={() =>
                void run([
                  { kind: 'schedule.manual.remove', id: event.id, at: at() },
                ])
              }
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
      {editing === undefined ? (
        <button
          className="button"
          type="button"
          onClick={() => {
            setEditing('new');
          }}
        >
          Добавить занятие
        </button>
      ) : (
        <ManualEventForm
          key={editing}
          initial={current ? draftOf(current) : emptyDraft(today)}
          submitLabel={current ? 'Сохранить занятие' : 'Добавить занятие'}
          onSubmit={save}
          onCancel={() => {
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
