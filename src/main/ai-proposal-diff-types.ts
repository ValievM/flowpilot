import type { RulesDocument, Task } from '../domain';
import type { AiSnapshot } from './ai-proposal-validation';

export interface AiFieldChange {
  readonly commandIndex: number;
  readonly entityId: string;
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface DiffState {
  readonly tasks: Map<string, Task>;
  readonly columns: AiSnapshot['columns'];
  readonly rules: Map<string, RulesDocument>;
  readonly activeRuleIds: Set<string>;
  readonly changes: AiFieldChange[];
}
