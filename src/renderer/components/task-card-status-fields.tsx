import React from 'react';
import type { Task } from '../../domain';
import type { IpcSnapshot } from '../../shared/contracts';
import type { PersistedState } from '../use-persisted-tasks';

type Column = IpcSnapshot['columns'][number];

export function TaskCardStatusFields({
  task,
  columns,
  onApply,
}: {
  readonly task: Task;
  readonly columns: readonly Column[];
  readonly onApply: PersistedState['applyCard'];
}): React.JSX.Element {
  const [waitingReason, setWaitingReason] = React.useState(
    task.status.kind === 'waiting' ? task.status.reason : '',
  );
  const [waitingUntil, setWaitingUntil] = React.useState(
    task.status.kind === 'waiting' ? (task.status.until?.toString() ?? '') : '',
  );
  const [pendingWaiting, setPendingWaiting] = React.useState(false);
  const waitingColumn = columns.find((column) => column.state === 'waiting');
  const move = async (columnId: string): Promise<void> => {
    const column = columns.find((item) => item.id === columnId);
    if (!column) return;
    if (column.state === 'waiting') {
      setPendingWaiting(true);
      setWaitingReason(
        task.status.kind === 'waiting' ? task.status.reason : '',
      );
      setWaitingUntil(
        task.status.kind === 'waiting'
          ? (task.status.until?.toString() ?? '')
          : '',
      );
      return;
    }
    setPendingWaiting(false);
    setWaitingReason('');
    setWaitingUntil('');
    await onApply([
      {
        kind: 'task.move',
        id: task.id,
        columnId,
        status: { kind: column.state },
      },
    ]);
  };
  const saveWaiting = async (): Promise<void> => {
    const reason = waitingReason.trim();
    if (!reason || !waitingColumn) return;
    const result = await onApply([
      {
        kind: 'task.move',
        id: task.id,
        columnId: waitingColumn.id,
        status: {
          kind: 'waiting',
          reason,
          ...(waitingUntil ? { until: waitingUntil } : {}),
        },
      },
    ]);
    setPendingWaiting(result !== 'saved');
  };
  return (
    <>
      <div>
        <label htmlFor="task-card-column">Колонка</label>
        <select
          id="task-card-column"
          value={
            pendingWaiting
              ? (waitingColumn?.id ?? task.columnId)
              : task.columnId
          }
          onChange={(event) => {
            void move(event.target.value);
          }}
        >
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </div>
      {(task.status.kind === 'waiting' || pendingWaiting) && (
        <>
          <div>
            <label htmlFor="task-card-waiting-reason">Причина ожидания</label>
            <input
              id="task-card-waiting-reason"
              value={waitingReason}
              onChange={(event) => {
                setWaitingReason(event.target.value);
              }}
            />
          </div>
          <div>
            <label htmlFor="task-card-waiting-until">Ожидаю до</label>
            <input
              id="task-card-waiting-until"
              type="date"
              value={waitingUntil}
              onChange={(event) => {
                setWaitingUntil(event.target.value);
              }}
            />
          </div>
          <button
            className="button"
            type="button"
            onClick={() => {
              void saveWaiting();
            }}
            disabled={!waitingReason.trim()}
          >
            Сохранить ожидание
          </button>
        </>
      )}
    </>
  );
}
