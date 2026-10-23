import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { Task } from '../../domain/task';
import { eventTime } from '../schedule/schedule-copy';
import {
  conflictingEvents,
  type SchedulePlan,
} from '../schedule/schedule-model';

/** A task that has a time inside a class says so. Nothing is moved. */
export function ConflictNote({
  task,
  today,
  plan,
}: {
  readonly task: Task;
  readonly today: Temporal.PlainDate;
  readonly plan: SchedulePlan;
}): React.JSX.Element | null {
  if (!task.time || !task.day || !task.day.equals(today)) return null;
  const overlapping = conflictingEvents(
    plan,
    today,
    task.time,
    Temporal.Now.timeZoneId(),
  )[0];
  if (!overlapping) return null;
  return (
    <p className="schedule-conflict" role="note">
      Пересекается с занятием «{overlapping.title}», {eventTime(overlapping)}.
      Ничего не сдвинуто: решение за вами.
    </p>
  );
}

export function NextClass({
  plan,
}: {
  readonly plan: SchedulePlan;
}): React.JSX.Element | null {
  const next = plan.nextClass;
  if (!next) return null;
  const day = next.start
    .toPlainDate()
    .equals(plan.today[0]?.start.toPlainDate() ?? next.start.toPlainDate())
    ? ''
    : `${next.start.toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}, `;
  return (
    <p className="next-class">
      <strong>Ближайшее занятие:</strong> {day}
      {eventTime(next)} · {next.title}
      {next.place ? ` · ${next.place}` : ''}
    </p>
  );
}
