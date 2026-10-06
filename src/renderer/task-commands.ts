import type { Task } from '../domain';
import type { PersistedState } from './use-persisted-tasks';

export async function startTask(
  state: PersistedState,
  task: Task,
): Promise<void> {
  await state.apply([
    {
      kind: 'task.move',
      id: task.id,
      columnId: 'doing',
      status: { kind: 'doing' },
    },
  ]);
}

export async function addTask(
  state: PersistedState,
  title: string,
  today: string,
): Promise<boolean> {
  const todo = state.columns.find((column) => column.state === 'todo');
  if (!todo) return false;
  const addedOrder =
    Math.max(0, ...state.tasks.map((task) => task.addedOrder)) + 1;
  return state.apply([
    {
      kind: 'task.create',
      task: {
        id: crypto.randomUUID(),
        title,
        status: { kind: 'todo' },
        columnId: todo.id,
        day: today,
        subtasks: [],
        comments: [],
        attachments: [],
        addedOrder,
      },
    },
  ]);
}
