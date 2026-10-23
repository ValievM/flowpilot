import { z } from 'zod';
import type { Snapshot } from '../storage';

export type IpcCatalog = Pick<Snapshot, 'taskTypes' | 'disciplines'>;
export type IpcStoredRule = Snapshot['rules'][number];

export type IpcRuleIssue = {
  readonly path: string;
  readonly code: string;
  readonly reason: string;
  readonly suggestion: string;
};
export type IpcRuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error:
        | {
            readonly kind:
              | 'ValidationFailed'
              | 'Cancelled'
              | 'NotFound'
              | 'RuleConflict'
              | 'InternalError';
          }
        | {
            readonly kind: 'RuleInvalid';
            readonly errors: readonly IpcRuleIssue[];
          };
    };

export const catalogListRequestSchema = z.object({}).strict();
export const rulesListRequestSchema = z.object({}).strict();
export const rulesImportFileRequestSchema = z.object({}).strict();
export const ruleIdRequestSchema = z.object({ id: z.string().min(1) }).strict();
export const ruleBindRequestSchema = z
  .object({
    id: z.string().min(1),
    scope: z
      .object({
        task_type_ids: z.array(z.string().min(1)),
        discipline_ids: z.array(z.string().min(1)).optional(),
      })
      .strict(),
  })
  .strict();
export type RuleIdRequest = z.infer<typeof ruleIdRequestSchema>;
export type RuleBindRequest = z.infer<typeof ruleBindRequestSchema>;

export type CatalogApi = {
  list(): Promise<IpcRuleResult<Pick<Snapshot, 'taskTypes' | 'disciplines'>>>;
};

export type RulesApi = {
  list(): Promise<IpcRuleResult<Snapshot['rules']>>;
  importFile(): Promise<IpcRuleResult<Snapshot['rules'][number]>>;
  exportFile(request: RuleIdRequest): Promise<IpcRuleResult<null>>;
  activate(
    request: RuleIdRequest,
  ): Promise<IpcRuleResult<Snapshot['rules'][number]>>;
  deactivate(
    request: RuleIdRequest,
  ): Promise<IpcRuleResult<Snapshot['rules'][number]>>;
  bind(
    request: RuleBindRequest,
  ): Promise<IpcRuleResult<Snapshot['rules'][number]>>;
};
