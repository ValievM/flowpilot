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
  onMove: (taskId: string, column: Column) => void;
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
  onMove: (taskId: string, column: Column) => void;
  onRename: (column: Column) => void;
  onDelete: (column: Column, hasTasks: boolean) => void;
}): React.JSX.Element {
  return (
    <BoardDragContext
      columns={snapshot.columns}
      tasks={snapshot.tasks}
      onMove={onMove}
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
              onMove={onMove}
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
  onMove: (taskId: string, column: Column) => void;
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
  onMove: (taskId: string, column: Column) => void;
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
  onMove: (taskId: string, column: Column) => void;
}): React.JSX.Element {
  return (
    <>
      <label className="board-move-label" htmlFor={`move-${task.id}`}>
        Переместить в…
      </label>
      <select
        id={`move-${task.id}`}
        value=""
        onChange={(event) => {
          const target = columns.find((item) => item.id === event.target.value);
          if (target) onMove(task.id, target);
        }}
      >
        <option value="">Выберите колонку</option>
        {columns
          .filter((item) => item.id !== column.id)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </select>
    </>
  );
}
