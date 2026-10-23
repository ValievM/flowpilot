import React from 'react';
import { Temporal } from 'temporal-polyfill';
import { ageText, eventTime, sourceName } from '../schedule/schedule-copy';
import type { SchedulePlan } from '../schedule/schedule-model';

interface ScheduleStripProps {
  readonly plan: SchedulePlan;
  readonly now: Temporal.ZonedDateTime;
  readonly onOpenSources: () => void;
}

function Source({
  plan,
  now,
}: {
  readonly plan: SchedulePlan;
  readonly now: Temporal.ZonedDateTime;
}): React.JSX.Element {
  const newest = [...plan.sources].sort((left, right) =>
    Temporal.ZonedDateTime.compare(right.fetchedAt, left.fetchedAt),
  )[0];
  return (
    <div className="schedule-source">
      <h2>Расписание</h2>
      {newest && (
        <p>
          {sourceName(newest.source)} · снимок {ageText(newest.fetchedAt, now)}
        </p>
      )}
    </div>
  );
}

function Banner({
  plan,
  now,
}: {
  readonly plan: SchedulePlan;
  readonly now: Temporal.ZonedDateTime;
}): React.JSX.Element | null {
  const failed = plan.errors[0];
  if (!failed) return null;
  return (
    <div className="schedule-banner" role="alert">
      <strong>{sourceName(failed.source)} не обновлён</strong>
      <p>
        Показан последний успешный снимок: {ageText(failed.fetchedAt, now)}.
        Занятия не исчезли из расписания, занятость не считается свободной.
      </p>
    </div>
  );
}

export function ScheduleStrip({
  plan,
  now,
  onOpenSources,
}: ScheduleStripProps): React.JSX.Element {
  if (!plan.hasData)
    return (
      <section className="schedule-strip is-empty" aria-label="Расписание">
        <p>
          Расписания пока нет. Импортируйте файл .ics или добавьте занятия
          вручную.{' '}
          <button
            className="schedule-link"
            type="button"
            onClick={onOpenSources}
          >
            Открыть источники
          </button>
        </p>
      </section>
    );
  const shown = plan.next.slice(0, 3);
  return (
    <section className="schedule-strip" aria-label="Расписание">
      <Banner plan={plan} now={now} />
      <div className="schedule-row">
        <Source plan={plan} now={now} />
        {shown.map((event) => (
          <div className="schedule-item" key={event.key}>
            <span className="schedule-time">{eventTime(event)}</span>
            <strong>{event.title}</strong>
            {event.place && <span>{event.place}</span>}
          </div>
        ))}
        {plan.free && (
          <div className="schedule-item">
            <span className="schedule-time">ВЕЧЕР</span>
            <strong>Свободно от занятий</strong>
            <span>Задачи без привязки ко времени</span>
          </div>
        )}
        {shown.length === 0 && !plan.free && (
          <div className="schedule-item">
            <span>Сегодня занятий больше нет в этом снимке.</span>
          </div>
        )}
      </div>
    </section>
  );
}
