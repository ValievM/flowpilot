import type { Temporal } from 'temporal-polyfill';
import type {
  Task,
  TaskColumn,
  TaskStatus,
  Subtask,
  TaskComment,
  AttachmentMetadata,
} from '../domain';

export interface Clock {
  now(): Temporal.Instant;
}

export interface Snapshot {
  readonly columns: readonly TaskColumn[];
  readonly tasks: readonly Task[];
  readonly settings: Readonly<Record<string, unknown>>;
  readonly revision: number;
}

type TaskUpdateChanges = Partial<
  Omit<
    Pick<
      Task,
      | 'title'
      | 'description'
      | 'day'
      | 'time'
      | 'deadline'
      | 'estimate'
      | 'rolledOverFrom'
      | 'addedOrder'
      | 'status'
    >,
    'description' | 'day' | 'time' | 'deadline' | 'estimate' | 'rolledOverFrom'
  >
> & {
  description?: string | null;
  day?: Task['day'] | null;
  time?: Task['time'] | null;
  deadline?: Task['deadline'] | null;
  estimate?: Task['estimate'] | null;
  rolledOverFrom?: Task['rolledOverFrom'] | null;
};

export type StorageCommand =
  | { kind: 'task.create'; task: Task }
  | { kind: 'task.update'; id: string; changes: TaskUpdateChanges }
  | { kind: 'task.move'; id: string; columnId: string; status?: TaskStatus }
  | { kind: 'subtask.add'; taskId: string; subtask: Subtask }
  | {
      kind: 'subtask.complete';
      taskId: string;
      subtaskId: string;
      completed: boolean;
    }
  | { kind: 'comment.add'; taskId: string; comment: TaskComment }
  | { kind: 'attachment.add'; taskId: string; attachment: AttachmentMetadata }
  | { kind: 'column.create'; column: TaskColumn }
  | { kind: 'column.rename'; id: string; name: string; description: string }
  | { kind: 'column.delete'; id: string; targetColumnId?: string }
  | { kind: 'setting.set'; key: string; value: unknown };

export type ApplyResult =
  | { ok: true; value: { revision: number } }
  | {
      ok: false;
      error:
        | { kind: 'StaleRevision'; expected: number; actual: number }
        | { kind: 'InvalidCommand'; message: string };
    };
