import type { Temporal } from 'temporal-polyfill';
import type {
  SubtaskDraft,
  Task,
  TaskColumn,
  TaskCommentDraft,
  TaskCreationDraft,
  TaskStatus,
  WaitingDetails,
} from '../domain';
export type HistoryEntry = {
  id: string;
  revision: number;
  occurredAt: string;
  source: 'user' | 'ai' | 'undo' | 'restore';
  batchId: string;
  undoneEntryId: string | null;
  entities: readonly {
    kind: string;
    id: string;
    before: unknown;
    after: unknown;
    versionAfter: number | null;
  }[];
};

export interface Clock {
  now(): Temporal.Instant;
}

export interface Snapshot {
  readonly columns: readonly TaskColumn[];
  readonly tasks: readonly Task[];
  readonly settings: Readonly<Record<string, unknown>>;
  readonly revision: number;
}
export type AiMode = 'auto' | 'confirm';

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
  | { kind: 'task.create'; task: TaskCreationDraft }
  | { kind: 'task.update'; id: string; changes: TaskUpdateChanges }
  | { kind: 'task.move'; id: string; columnId: string; status?: TaskStatus }
  | { kind: 'subtask.add'; taskId: string; subtask: SubtaskDraft }
  | {
      kind: 'subtask.complete';
      taskId: string;
      subtaskId: string;
      completed: boolean;
    }
  | {
      kind: 'subtask.rename';
      taskId: string;
      subtaskId: string;
      title: string;
    }
  | { kind: 'subtask.remove'; taskId: string; subtaskId: string }
  | {
      kind: 'subtask.move';
      taskId: string;
      subtaskId: string;
      position: number;
    }
  | { kind: 'comment.add'; taskId: string; comment: TaskCommentDraft }
  | { kind: 'attachment.add'; taskId: string; sourcePath: string }
  | { kind: 'attachment.remove'; attachmentId: string }
  | { kind: 'task.setAiRank'; taskId: string; rank: number }
  | { kind: 'column.create'; column: TaskColumn }
  | { kind: 'column.rename'; id: string; name: string; description: string }
  | {
      kind: 'column.delete';
      id: string;
      targetColumnId?: string;
      waiting?: WaitingDetails;
    }
  | { kind: 'setting.set'; key: string; value: unknown };

export interface RejectedAiCommand {
  readonly index: number;
  readonly kind: string;
  readonly reason: string;
}

export interface AppliedOperation {
  readonly revision: number;
  readonly rejectedCommands: readonly RejectedAiCommand[];
}

export interface ApplyOptions {
  readonly source?: 'user' | 'ai';
  readonly proposalId?: string;
  readonly rejectedCommands?: readonly RejectedAiCommand[];
}

export type HistoryPage = {
  readonly entries: readonly HistoryEntry[];
};

export type ApplyResult =
  | { ok: true; value: { revision: number } }
  | {
      ok: false;
      error:
        | { kind: 'StaleRevision'; expected: number; actual: number }
        | { kind: 'InvalidCommand'; message: string };
    };

export type UndoResult =
  | { ok: true; value: { revision: number } }
  | {
      ok: false;
      error:
        | {
            kind: 'NotFound' | 'AlreadyUndone' | 'NotUndoable';
            reason?: string;
          }
        | {
            kind: 'UndoConflict';
            entities: readonly { kind: string; id: string }[];
          };
    };
