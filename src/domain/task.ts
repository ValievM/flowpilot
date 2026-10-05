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
}

export interface TaskComment {
  id: string;
  text: string;
}

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
  addedOrder: number;
}

export interface TaskColumn {
  id: string;
  name: string;
  description: string;
  state: TaskStatus['kind'];
  builtIn: boolean;
}
