import { Temporal } from 'temporal-polyfill';
import type { Task } from '../domain';
import type { IpcSnapshot } from '../shared/contracts';

interface ParsedTasks {
  readonly tasks: readonly Task[];
  readonly columns: IpcSnapshot['columns'];
  readonly revision: number;
  readonly workdays: ReadonlySet<number>;
}

function taskFromIpc(task: IpcSnapshot['tasks'][number]): Task {
  const { day, time, deadline, rolledOverFrom, status, comments, ...rest } =
    task;
  const parsedStatus: Task['status'] =
    status.kind === 'waiting'
      ? {
          kind: 'waiting',
          reason: status.reason,
          ...(status.until
            ? { until: Temporal.PlainDate.from(status.until) }
            : {}),
        }
      : status;
  return {
    ...rest,
    comments: comments.map(({ createdAt, ...comment }) => ({
      ...comment,
      createdAt: createdAt === null ? null : Temporal.Instant.from(createdAt),
    })),
    ...(day ? { day: Temporal.PlainDate.from(day) } : {}),
    ...(time ? { time: Temporal.PlainTime.from(time) } : {}),
    ...(deadline ? { deadline: Temporal.PlainDate.from(deadline) } : {}),
    ...(rolledOverFrom
      ? { rolledOverFrom: Temporal.PlainDate.from(rolledOverFrom) }
      : {}),
    status: parsedStatus,
  };
}

function parsedSnapshot(snapshot: IpcSnapshot) {
  const configured = snapshot.settings.workdays;
  const workdays = Array.isArray(configured)
    ? configured.filter((day): day is number => typeof day === 'number')
    : [1, 2, 3, 4, 5];
  return {
    tasks: snapshot.tasks.map(taskFromIpc),
    columns: snapshot.columns,
    revision: snapshot.revision,
    workdays: new Set(workdays),
  };
}

export function parsedTasks(snapshot: IpcSnapshot | undefined): ParsedTasks {
  if (snapshot) return parsedSnapshot(snapshot);
  return {
    tasks: [],
    columns: [],
    revision: 0,
    workdays: new Set([1, 2, 3, 4, 5]),
  };
}
