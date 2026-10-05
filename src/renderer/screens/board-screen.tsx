import React from 'react';
import type { TodayTask } from '../fixtures/today';
import { TaskSummary } from '../components/task-summary';

type TaskState = TodayTask['state'];

export function BoardScreen({
  tasks,
}: {
  tasks: TodayTask[];
}): React.JSX.Element {
  const columns: readonly { state: TaskState; title: string }[] = [
    { state: 'todo', title: 'Сделать' },
    { state: 'doing', title: 'В работе' },
    { state: 'waiting', title: 'Ожидание' },
  ];
  return (
    <section className="simple-screen">
      <p className="eyebrow">ЛИЧНОЕ / ДОСКА</p>
      <h1>Доска</h1>
      <div className="board-columns">
        {columns.map((column) => {
          const columnTasks = tasks.filter(
            (task) => task.state === column.state,
          );
          return (
            <section className="board-column" key={column.state}>
              <h2 className="board-column-heading">
                {column.title}{' '}
                <span className="board-count">{columnTasks.length}</span>
              </h2>
              {columnTasks.map((task) => (
                <TaskSummary key={task.id} task={task} />
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
