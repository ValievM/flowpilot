import React from 'react';
import { Temporal } from 'temporal-polyfill';
import { deadlineRisk } from '../../domain/risk/risk';
import type { Task } from '../../domain/task';
import type { IpcSnapshot } from '../../shared/contracts';
import { boardRiskCopy } from './board-copy';
import type { BoardRiskCopy } from './board-copy';

type BoardTask = IpcSnapshot['tasks'][number];

export function BoardRiskMark({
  task,
  snapshot,
}: {
  task: BoardTask;
  snapshot: IpcSnapshot;
}): React.JSX.Element | null {
  const display = boardRiskDisplay(task, snapshot);
  if (!display) return null;
  return (
    <div className="board-risk">
      <p className={display.isRisk ? 'risk-label' : 'board-risk-unknown'}>
        {display.isRisk && (
          <span className="risk-icon" aria-hidden="true">
            !
          </span>
        )}
        {display.label}
      </p>
      <p className="board-risk-reason">{display.reason}</p>
    </div>
  );
}

function boardRiskDisplay(
  task: BoardTask,
  snapshot: IpcSnapshot,
): BoardRiskCopy | undefined {
  if (!task.deadline) return undefined;
  const settings = snapshot.settings.workdays;
  const workdays = new Set(
    Array.isArray(settings)
      ? settings.filter((value): value is number => typeof value === 'number')
      : [],
  );
  return boardRiskCopy(
    deadlineRisk(toDomainTask(task), Temporal.Now.plainDateISO(), workdays),
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
