import React from 'react';
import { Temporal } from 'temporal-polyfill';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import { deadlineRisk } from '../../domain/risk/risk';
import type { Task } from '../../domain/task';
import type { IpcSnapshot } from '../../shared/contracts';
import { deadlineMessage, deadlineTitle } from '../deadline-copy';

type BoardTask = IpcSnapshot['tasks'][number];

export function BoardRiskMark({
  task,
  snapshot,
  today,
}: {
  task: BoardTask;
  snapshot: IpcSnapshot;
  today: TemporalTypes.PlainDate;
}): React.JSX.Element | null {
  if (!task.deadline) return null;
  const settings = snapshot.settings.workdays;
  const configuredWorkdays = new Set(
    Array.isArray(settings)
      ? settings.filter((value): value is number => typeof value === 'number')
      : [],
  );
  const risk = deadlineRisk(toDomainTask(task), today, configuredWorkdays);
  const message = deadlineMessage(risk);
  if (!message || !risk.ok) return null;
  const title = deadlineTitle(risk);
  const isRisk = ['tight', 'short', 'overdue'].includes(risk.risk);
  return (
    <p
      className={`risk-label${risk.risk === 'unknown' ? ' risk-unknown' : ''}${isRisk ? ' is-risk' : ''}`}
      data-risk-kind={risk.risk}
      title={title}
    >
      <span className="risk-icon" aria-hidden="true">
        {isRisk ? '!' : 'i'}
      </span>
      {title && <strong>{title}: </strong>}
      {message}
    </p>
  );
}

function toDomainTask(task: BoardTask): Task {
  const status =
    task.status.kind === 'waiting'
      ? {
          kind: 'waiting' as const,
          reason: task.status.reason,
          ...(task.status.until
            ? { until: Temporal.PlainDate.from(task.status.until) }
            : {}),
        }
      : task.status;
  return {
    id: task.id,
    title: task.title,
    status,
    columnId: task.columnId,
    ...(task.typeId ? { typeId: task.typeId } : {}),
    ...(task.disciplineId ? { disciplineId: task.disciplineId } : {}),
    ...(task.day ? { day: Temporal.PlainDate.from(task.day) } : {}),
    ...(task.time ? { time: Temporal.PlainTime.from(task.time) } : {}),
    ...(task.deadline
      ? { deadline: Temporal.PlainDate.from(task.deadline) }
      : {}),
    ...(task.estimate ? { estimate: task.estimate } : {}),
    subtasks: task.subtasks,
    comments: task.comments,
    attachments: task.attachments,
    ...(task.rolledOverFrom
      ? { rolledOverFrom: Temporal.PlainDate.from(task.rolledOverFrom) }
      : {}),
    addedOrder: task.addedOrder,
  };
}
