import type { Temporal } from 'temporal-polyfill';

export type TaskStatus =
  | { kind: 'todo' }
  | { kind: 'doing' }
  | { kind: 'done' }
  | { kind: 'waiting'; reason: string; until?: Temporal.PlainDate };

export interface RemainingEstimate {
  unit: 'workdays';
  value: number;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  position: number;
}

export interface SubtaskDraft {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskComment {
  id: string;
  text: string;
  /** null for legacy rows created before the timestamp was tracked. */
  createdAt: Temporal.Instant | null;
}

export interface TaskCommentDraft {
  id: string;
  text: string;
}

/** A task payload for creation commands: relations carry no persisted fields. */
export type TaskCreationDraft = Omit<Task, 'subtasks' | 'comments'> & {
  subtasks: readonly SubtaskDraft[];
  comments: readonly TaskCommentDraft[];
};

export interface AttachmentMetadata {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
}

export type CategoryColor = 'study' | 'health' | 'personal' | 'none';

export interface TaskType {
  id: string;
  name: string;
  color?: CategoryColor;
}

export interface Discipline {
  id: string;
  name: string;
  color?: CategoryColor;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  columnId: string;
  typeId?: string;
  disciplineId?: string;
  day?: Temporal.PlainDate;
  time?: Temporal.PlainTime;
  deadline?: Temporal.PlainDate;
  estimate?: RemainingEstimate;
  subtasks: readonly Subtask[];
  comments: readonly TaskComment[];
  attachments: readonly AttachmentMetadata[];
  rolledOverFrom?: Temporal.PlainDate;
  aiRank?: number;
  addedOrder: number;
}

export interface TaskColumn {
  id: string;
  name: string;
  description: string;
  state: TaskStatus['kind'];
  builtIn: boolean;
}
