import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import React from 'react';
import type { IpcSnapshot } from '../../shared/contracts';
import { BoardRiskMark } from './board-risk-mark';
import {
  BoardDraggableTask,
  BoardDragContext,
  BoardDroppableColumn,
} from './board-drag';

type Column = IpcSnapshot['columns'][number];
type Task = IpcSnapshot['tasks'][number];

type BoardColumnProps = {
  column: Column;
  tasks: readonly Task[];
  columns: readonly Column[];
  snapshot: IpcSnapshot;
  onMove: (taskId: string, column: Column) => Promise<boolean>;
  onRename: (column: Column) => void;
  onDelete: () => void;
};

export function BoardColumns({
  snapshot,
  onMove,
  onRename,
  onDelete,
}: {
  snapshot: IpcSnapshot;
  onMove: (taskId: string, column: Column) => Promise<boolean>;
  onRename: (column: Column) => void;
  onDelete: (column: Column, hasTasks: boolean) => void;
}): React.JSX.Element {
  const pendingFocus = React.useRef<
    { taskId: string; columnId: string } | undefined
  >(undefined);
  React.useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    const task = snapshot.tasks.find((item) => item.id === request.taskId);
    if (task?.columnId !== request.columnId) return;
    document.getElementById(`board-task-${request.taskId}`)?.focus();
    pendingFocus.current = undefined;
  }, [snapshot]);
  const moveTask = async (taskId: string, column: Column): Promise<boolean> => {
    const current = pendingFocus.current;
    if (current?.taskId === taskId && current.columnId === column.id)
      return false;
    const request = { taskId, columnId: column.id };
    pendingFocus.current = request;
    const saved = await onMove(taskId, column);
    if (!saved && pendingFocus.current === request)
      pendingFocus.current = undefined;
    return saved;
  };
  return (
    <BoardDragContext
      columns={snapshot.columns}
      tasks={snapshot.tasks}
      onMove={(taskId, column) => {
        void moveTask(taskId, column);
      }}
    >
      <div className="board-columns">
        {snapshot.columns.map((column) => {
          const tasks = snapshot.tasks.filter(
            (task) => task.columnId === column.id,
          );
          return (
            <BoardColumn
              key={column.id}
              column={column}
              tasks={tasks}
              columns={snapshot.columns}
              snapshot={snapshot}
              onMove={moveTask}
              onRename={onRename}
              onDelete={() => {
                onDelete(column, tasks.length > 0);
              }}
            />
          );
        })}
      </div>
    </BoardDragContext>
  );
}
function BoardColumn({
  column,
  tasks,
  columns,
  snapshot,
  onMove,
  onRename,
  onDelete,
}: BoardColumnProps): React.JSX.Element {
  return (
    <BoardDroppableColumn
      id={column.id}
      label={column.name}
      className="board-column"
    >
      <div className="board-column-heading">
        <h2>{column.name}</h2>
        <span className="board-count">{tasks.length}</span>
      </div>
      <ColumnActions column={column} onRename={onRename} onDelete={onDelete} />
      <BoardTaskList
        column={column}
        tasks={tasks}
        columns={columns}
        snapshot={snapshot}
        onMove={onMove}
      />
    </BoardDroppableColumn>
  );
}

function ColumnActions({
  column,
  onRename,
  onDelete,
}: {
  column: Column;
  onRename: (column: Column) => void;
  onDelete: () => void;
}): React.JSX.Element | null {
  if (column.builtIn) return null;
  return (
    <div className="board-column-actions">
      <button
        className="text-button"
        onClick={() => {
          onRename(column);
        }}
      >
        Переименовать колонку {column.name}
      </button>
      <button className="text-button" onClick={onDelete}>
        Удалить колонку
      </button>
    </div>
  );
}

function BoardTaskList({
  column,
  tasks,
  columns,
  snapshot,
  onMove,
}: {
  column: Column;
  tasks: readonly Task[];
  columns: readonly Column[];
  snapshot: IpcSnapshot;
  onMove: (taskId: string, column: Column) => Promise<boolean>;
}): React.JSX.Element {
  if (!tasks.length) {
    return <p className="board-column-empty">В этой колонке пока нет задач.</p>;
  }
  return (
    <>
      {tasks.map((task) => (
        <BoardTaskCard
          key={task.id}
          task={task}
          column={column}
          columns={columns}
          snapshot={snapshot}
          onMove={onMove}
        />
      ))}
    </>
  );
}
function BoardTaskCard({
  task,
  column,
  columns,
  snapshot,
  onMove,
}: {
  task: Task;
  column: Column;
  columns: readonly Column[];
  snapshot: IpcSnapshot;
  onMove: (taskId: string, column: Column) => Promise<boolean>;
}): React.JSX.Element {
  return (
    <BoardDraggableTask
      id={task.id}
      className="task-summary board-task"
      label={`Задача: ${task.title}`}
    >
      <BoardRiskMark task={task} snapshot={snapshot} />
      <h3>{task.title}</h3>
      {task.deadline && (
        <p className="task-summary-meta">Срок: {task.deadline}</p>
      )}
      {task.status.kind === 'waiting' && (
        <p className="board-waiting-reason">
          Причина ожидания: {task.status.reason}
        </p>
      )}
      <BoardMoveMenu
        task={task}
        column={column}
        columns={columns}
        onMove={onMove}
      />
    </BoardDraggableTask>
  );
}

function BoardMoveMenu({
  task,
  column,
  columns,
  onMove,
}: {
  task: Task;
  column: Column;
  columns: readonly Column[];
  onMove: (taskId: string, column: Column) => Promise<boolean>;
}): React.JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="board-move-trigger">
        Переместить в…
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="board-move-menu"
          aria-label={`Переместить задачу «${task.title}» в`}
          align="start"
        >
          {columns
            .filter((item) => item.id !== column.id)
            .map((item) => (
              <DropdownMenu.Item
                key={item.id}
                className="board-move-item"
                onSelect={() => {
                  void onMove(task.id, item);
                }}
              >
                {item.name}
              </DropdownMenu.Item>
            ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
