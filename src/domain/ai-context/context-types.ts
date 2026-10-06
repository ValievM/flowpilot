import type { Temporal } from 'temporal-polyfill';
import type { DeadlineRiskResult } from '../risk/risk';
import type { Outcome, Series } from '../repeat';
import type { RulesDocument } from '../rules';
import type { ScheduleSnapshot } from '../schedule/fixed-events';
import type { Task, TaskColumn, TaskType, Discipline } from '../task';

export interface ContextInput {
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.ZonedDateTime;
  readonly tasks: readonly Task[];
  readonly series: readonly Series[];
  readonly outcomes: readonly Outcome[];
  readonly activeRules: readonly RulesDocument[];
  readonly taskTypes: readonly TaskType[];
  readonly disciplines: readonly Discipline[];
  readonly workdays: ReadonlySet<number>;
  readonly columns?: readonly TaskColumn[];
  readonly schedule?: ScheduleSnapshot;
}

export interface ContextReferenceRule {
  readonly trust: 'untrusted';
  readonly documentId: string;
  readonly id: string;
  readonly kind: 'priority' | 'time_window';
  readonly summary: string;
}

export interface EffectivePriority {
  readonly trust: 'untrusted';
  readonly level: 'high' | 'normal' | 'low';
  readonly reason: string;
}

export interface ContextTask {
  readonly id: string;
  readonly typeId?: string;
  readonly columnId: string;
  readonly untrustedColumn?: {
    readonly trust: 'untrusted';
    readonly name: string;
    readonly description: string;
  };
  readonly disciplineId?: string;
  readonly state: Task['status']['kind'];
  readonly day?: string;
  readonly time?: string;
  readonly deadline?: string;
  readonly deadlineRisk: DeadlineRiskResult;
  readonly availability:
    'available-now' | 'today' | 'rolled-over' | 'waiting' | 'future';
  readonly rules: {
    readonly trust: 'untrusted';
    readonly effectivePriority: EffectivePriority | null;
    readonly conflict: boolean;
    readonly reference: readonly ContextReferenceRule[];
  };
  readonly untrusted: {
    readonly trust: 'untrusted';
    readonly title: string;
    readonly description?: string;
    readonly waitingReason?: string;
    readonly comments: readonly string[];
    readonly guidance: readonly {
      readonly trust: 'untrusted';
      readonly documentId: string;
      readonly text: string;
    }[];
    readonly subtasks: readonly {
      readonly id: string;
      readonly title: string;
      readonly completed: boolean;
    }[];
    readonly attachments: readonly {
      readonly name: string;
      readonly status: 'не прочитано';
    }[];
  };
}

export interface ContextRepeatGroup {
  readonly trust: 'untrusted';
  readonly seriesId: string;
  readonly title: string;
  readonly count: number;
  readonly dates: readonly string[];
  readonly first: string;
  readonly last: string;
}

export interface ContextEvent {
  readonly trust: 'untrusted';
  readonly key: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
}

export interface AiContext {
  readonly instructions: string;
  readonly today: string;
  readonly now: string;
  readonly tasks: readonly ContextTask[];
  readonly completedCount: number;
  readonly omittedTaskCount: number;
  readonly omittedTaskNotice?: string;
  readonly missedRepeats: readonly ContextRepeatGroup[];
  readonly taskTypes: readonly {
    readonly trust: 'untrusted';
    readonly id: string;
    readonly name: string;
  }[];
  readonly disciplines: readonly {
    readonly trust: 'untrusted';
    readonly id: string;
    readonly name: string;
  }[];
  readonly workdays: readonly number[];
  readonly schedule?: {
    readonly status: ScheduleSnapshot['status'];
    readonly fetchedAt: string;
    readonly nearestFixedEvents: readonly ContextEvent[];
  };
}

export const MAX_CONTEXT_TASKS = 100;
export const MAX_CONTEXT_TEXT_LENGTH = 1000;
