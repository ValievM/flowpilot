import type {
  Discipline,
  RuleDiagnostic,
  RulesDocument,
  TaskType,
} from '../domain';
import type { Temporal } from 'temporal-polyfill';
export type SeriesOutcomeInput<T> = T extends Outcome
  ? Omit<T, 'seriesId' | 'recordedAt'>
  : never;
export type SeriesChanges = {
  readonly title?: string;
  readonly description?: string | null;
  readonly weekdays?: readonly number[];
  readonly time?: Temporal.PlainTime | null;
  readonly startsOn?: Temporal.PlainDate;
  readonly endsOn?: Temporal.PlainDate | null;
};

import type {
  Outcome,
  Series,
  Task,
  TaskColumn,
  TaskStatus,
  Subtask,
  TaskComment,
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
  readonly taskTypes: readonly TaskType[];
  readonly disciplines: readonly Discipline[];
  readonly rules: readonly StoredRule[];
  readonly series: readonly Series[];
  readonly outcomes: readonly Outcome[];
  readonly settings: Readonly<Record<string, unknown>>;
  readonly revision: number;
}
export type AiMode = 'auto' | 'confirm';
export interface StoredRule {
  readonly id: string;
  readonly documentJson: string;
  readonly document: RulesDocument | null;
  readonly activeDocument: RulesDocument | null;
  readonly status: 'draft' | 'active';
  readonly version: number;
  readonly errors: readonly unknown[];
  readonly diagnostics: readonly RuleDiagnostic[];
  readonly versions: readonly {
    readonly version: number;
    readonly documentJson: string;
  }[];
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
  | { kind: 'setting.set'; key: string; value: unknown }
  | {
      kind: 'task.classify';
      taskId: string;
      typeId?: string | null | undefined;
      disciplineId?: string | null | undefined;
    }
  | { kind: 'taskType.create'; taskType: TaskType }
  | {
      kind: 'taskType.rename';
      id: string;
      name: string;
      color?: TaskType['color'];
    }
  | { kind: 'taskType.delete'; id: string; targetId?: string }
  | { kind: 'discipline.create'; discipline: Discipline }
  | {
      kind: 'discipline.rename';
      id: string;
      name: string;
      color?: Discipline['color'];
    }
  | { kind: 'discipline.delete'; id: string; targetId?: string }
  | { kind: 'rule.import'; documentJson: string }
  | { kind: 'rule.activate'; ruleId: string }
  | { kind: 'rule.deactivate'; ruleId: string }
  | { kind: 'rule.bind'; ruleId: string; scope: RulesDocument['scope'] }
  | { kind: 'series.create'; series: Series }
  | {
      kind: 'series.update';
      id: string;
      changes: SeriesChanges;
    }
  | { kind: 'series.stop'; id: string; endDate: Temporal.PlainDate }
  | {
      kind: 'series.recordOutcome';
      seriesId: string;
      outcome: SeriesOutcomeInput<Outcome>;
    };

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
        | { kind: 'InvalidCommand'; message: string }
        | { kind: 'FileNotFound' }
        | { kind: 'TooLarge' }
        | { kind: 'NotReadable' };
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
