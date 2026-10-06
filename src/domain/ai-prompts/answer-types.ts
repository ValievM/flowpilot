import type { RulesDocument } from '../rules';

export type ParseAnswerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export interface AnswerIds {
  readonly taskIds: readonly string[];
  readonly availableTaskIds?: readonly string[];
  readonly subtaskIds?: readonly string[];
  readonly columnIds?: readonly string[];
  readonly taskTypeIds?: readonly string[];
  readonly disciplineIds?: readonly string[];
}

export interface RuleEditIds extends AnswerIds {
  readonly taskTypeIds: readonly string[];
  readonly disciplineIds: readonly string[];
}
export interface NowAnswerIds extends AnswerIds {
  readonly availableTaskIds: readonly string[];
}

export interface NowAnswer {
  readonly action: {
    readonly taskId: string;
    readonly subtaskId?: string | undefined;
  } | null;
  readonly reason: string;
}

export interface CreateCardsAnswer {
  readonly cards: readonly {
    readonly title: string;
    readonly description?: string | undefined;
    readonly day?: string | undefined;
    readonly deadline?: string | undefined;
    readonly estimate?:
      { readonly unit: 'workdays'; readonly value: number } | undefined;
    readonly subtasks: readonly { readonly title: string }[];
  }[];
  readonly unknowns: readonly string[];
}

export type ReplanCommand =
  | {
      readonly kind: 'task.move';
      readonly id: string;
      readonly columnId: string;
    }
  | {
      readonly kind: 'task.update';
      readonly id: string;
      readonly changes: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: 'task.setAiRank';
      readonly taskId: string;
      readonly rank: number;
    };

export interface ReplanAnswer {
  readonly commands: readonly ReplanCommand[];
  readonly rationale: string;
}

export interface RuleEditAnswer {
  readonly document: RulesDocument;
  readonly taskId: string;
}
