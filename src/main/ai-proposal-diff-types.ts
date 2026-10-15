import type {
  RulesDocument,
  SubtaskDraft,
  Task,
  TaskCommentDraft,
} from '../domain';
import type { AiSnapshot } from './ai-proposal-validation';

export type DiffTask = Omit<Task, 'subtasks' | 'comments'> & {
  readonly subtasks: readonly (Task['subtasks'][number] | SubtaskDraft)[];
  readonly comments: readonly (Task['comments'][number] | TaskCommentDraft)[];
};

export interface AiFieldChange {
  readonly commandIndex: number;
  readonly entityId: string;
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface DiffState {
  readonly tasks: Map<string, DiffTask>;
  readonly columns: AiSnapshot['columns'];
  readonly rules: Map<string, RulesDocument>;
  readonly activeRuleIds: Set<string>;
  readonly changes: AiFieldChange[];
}
