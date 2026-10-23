import { z } from 'zod';
import {
  ipcCommandSchema,
  settingFields,
  validateGenericSettingValue,
} from './command-schema';
import type { Series, Task, TaskComment, TaskStatus } from '../domain';
import type { HistoryEntry, Snapshot } from '../storage';

export * from './rule-contracts';
export type { ExportInfo } from '../storage';
import type {
  AiCommand,
  AiTaskChanges,
  AiTaskCreation,
  Proposal,
} from './ai-commands';
type SerializedTaskCreation = Omit<
  AiTaskCreation,
  'day' | 'time' | 'deadline'
> & {
  readonly day?: string;
  readonly time?: string;
  readonly deadline?: string;
};
type SerializedTaskChanges = Omit<
  AiTaskChanges,
  'day' | 'time' | 'deadline'
> & {
  readonly day?: string | null;
  readonly time?: string | null;
  readonly deadline?: string | null;
};
type MoveStatus = NonNullable<
  Extract<AiCommand, { kind: 'task.move' }>['status']
>;
type SerializedMoveStatus =
  | Exclude<MoveStatus, { kind: 'waiting' }>
  | { kind: 'waiting'; reason: string; until?: string };
type SerializedTaskMove = Omit<
  Extract<AiCommand, { kind: 'task.move' }>,
  'status'
> & { readonly status?: SerializedMoveStatus };
export type AiIpcCommand =
  | { readonly kind: 'task.create'; readonly task: SerializedTaskCreation }
  | {
      readonly kind: 'task.update';
      readonly id: string;
      readonly changes: SerializedTaskChanges;
    }
  | SerializedTaskMove
  | Exclude<AiCommand, { kind: 'task.create' | 'task.update' | 'task.move' }>;
export type AiIpcProposal = Omit<Proposal, 'commands'> & {
  readonly commands: readonly AiIpcCommand[];
};
type IpcTaskStatus =
  | Exclude<TaskStatus, { kind: 'waiting' }>
  | { kind: 'waiting'; reason: string; until?: string };
type SerializedTaskComment = Omit<TaskComment, 'createdAt'> & {
  readonly createdAt: string | null;
};
type SerializedTask = Omit<
  Task,
  'day' | 'time' | 'deadline' | 'rolledOverFrom' | 'status' | 'comments'
> & {
  readonly day?: string;
  readonly time?: string;
  readonly deadline?: string;
  readonly rolledOverFrom?: string;
  readonly status: IpcTaskStatus;
  readonly comments: readonly SerializedTaskComment[];
};
type SerializedSeries = Omit<Series, 'startsOn' | 'endsOn' | 'time'> & {
  readonly startsOn: string;
  readonly endsOn?: string;
  readonly time?: string;
};
type SerializedOutcome =
  | {
      readonly kind: 'done' | 'skipped' | 'dismissed';
      readonly seriesId: string;
      readonly date: string;
      readonly recordedAt: string;
    }
  | {
      readonly kind: 'rescheduled';
      readonly seriesId: string;
      readonly date: string;
      readonly newDate: string;
      readonly newTime: string;
      readonly recordedAt: string;
    };
export type IpcSnapshot = Omit<
  Snapshot,
  'tasks' | 'series' | 'outcomes' | 'taskTypes' | 'disciplines' | 'rules'
> & {
  readonly tasks: readonly SerializedTask[];
  readonly series: readonly SerializedSeries[];
  readonly outcomes: readonly SerializedOutcome[];
};
export const ipcChannels = {
  snapshotLoad: 'snapshot.load',
  commandsApply: 'commands.apply',
  catalogList: 'catalog.list',
  rulesList: 'rules.list',
  rulesImportFile: 'rules.importFile',
  rulesExportFile: 'rules.exportFile',
  rulesActivate: 'rules.activate',
  rulesDeactivate: 'rules.deactivate',
  rulesBind: 'rules.bind',
  settingsGet: 'settings.get',
  settingsSet: 'settings.set',
  appInfo: 'app.info',
  aiRun: 'ai.run',
  aiCancel: 'ai.cancel',
  aiPrompt: 'ai.prompt',
  aiPending: 'ai.pending',
  aiReply: 'ai.reply',
  appearanceSetTheme: 'appearance.set-theme',
  aiScenario: 'ai.scenario',
  appearanceInitialize: 'appearance.initialize',
  appearanceReady: 'appearance.ready',
  historyList: 'history.list',
  historyUndo: 'history.undo',
  attachmentsAdd: 'attachments.add',
  attachmentsOpen: 'attachments.open',
  attachmentsRemove: 'attachments.remove',
  backupExport: 'backup.export',
  backupVerify: 'backup.verify',
  backupRestore: 'backup.restore',
} as const;
export const historyListRequestSchema = z
  .object({
    limit: z.number().int().positive(),
    before: z.string().min(1).optional(),
  })
  .strict();
export const historyUndoRequestSchema = z
  .object({ entryId: z.string().min(1).optional() })
  .strict();
export const attachmentAddRequestSchema = z
  .object({ taskId: z.string().min(1) })
  .strict();
export const attachmentOpenRequestSchema = z
  .object({ attachmentId: z.string().min(1) })
  .strict();
export const attachmentRemoveRequestSchema = attachmentOpenRequestSchema;
export const backupExportRequestSchema = z.object({}).strict();
export const backupVerifyRequestSchema = z.object({}).strict();
export const backupRestoreRequestSchema = z
  .object({ packageToken: z.string().min(1) })
  .strict();
export type IpcHistoryEntry = HistoryEntry;
export type BackupVerifyResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly packageToken: string;
        readonly problems: readonly [];
      };
    }
  | {
      readonly ok: false;
      readonly error: 'PackageInvalid';
      readonly problems: readonly {
        readonly path: string;
        readonly message: string;
      }[];
    }
  | {
      readonly ok: false;
      readonly error: 'ValidationFailed' | 'Cancelled';
    };
export type HistoryListRequest = z.infer<typeof historyListRequestSchema>;
export type HistoryUndoRequest = z.infer<typeof historyUndoRequestSchema>;
export type AttachmentAddRequest = z.infer<typeof attachmentAddRequestSchema>;
export type AttachmentOpenRequest = z.infer<typeof attachmentOpenRequestSchema>;
export type AttachmentRemoveRequest = z.infer<
  typeof attachmentRemoveRequestSchema
>;
export type BackupRestoreRequest = z.infer<typeof backupRestoreRequestSchema>;

export const appearanceThemeRequestSchema = z
  .object({ theme: z.enum(['system', 'light', 'dark']) })
  .strict();
export const appearanceInitializeRequestSchema = z
  .object({ legacyTheme: z.enum(['light', 'dark']).optional() })
  .strict();
export type ThemeChoice = z.infer<typeof appearanceThemeRequestSchema>['theme'];
export type AppearanceInitializeRequest = z.infer<
  typeof appearanceInitializeRequestSchema
>;
export const aiRequestSchema = z
  .object({
    operationId: z.string().min(1),
    context: z.unknown(),
    instruction: z.string().min(1),
    responseSchema: z.record(z.string(), z.unknown()),
  })
  .strict();
export const aiCancelRequestSchema = z
  .object({ operationId: z.string().min(1) })
  .strict();
export const aiReplyRequestSchema = z
  .object({ operationId: z.string().min(1), text: z.string() })
  .strict();
export const aiScenarioRequestSchema = z.discriminatedUnion('scenario', [
  z.object({ scenario: z.literal('whatNow') }).strict(),
  z
    .object({ scenario: z.literal('createFromText'), text: z.string() })
    .strict(),
  z.object({ scenario: z.literal('replan') }).strict(),
  z.object({ scenario: z.literal('cancel') }).strict(),
  z
    .object({
      scenario: z.literal('editRule'),
      instruction: z.string(),
      document: z.unknown(),
    })
    .strict(),
  z
    .object({ scenario: z.literal('confirm'), proposalId: z.string().min(1) })
    .strict(),
  z
    .object({ scenario: z.literal('reject'), proposalId: z.string().min(1) })
    .strict(),
]);
export type AiScenarioRequest = z.infer<typeof aiScenarioRequestSchema>;
export type AiScenarioResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly error: { readonly kind: string; readonly message: string };
    };
export type AiIpcRequest = z.infer<typeof aiRequestSchema>;
export type AiIpcResult =
  | { readonly ok: true; readonly value: AiIpcProposal }
  | {
      readonly ok: false;
      readonly error:
        | 'AlreadyRunning'
        | 'ProviderUnavailable'
        | 'InvalidReply'
        | 'Aborted'
        | 'ValidationFailed';
    };
export type AiManualReplyResult =
  | { readonly ok: true; readonly value: null }
  | { readonly ok: false; readonly error: 'NotFound' | 'ValidationFailed' };
export type AiCancelResult =
  | { readonly ok: true; readonly value: null }
  | { readonly ok: false; readonly error: 'ValidationFailed' };

export const snapshotLoadRequestSchema = z.object({}).strict();
export const commandsApplyRequestSchema = z
  .object({
    commands: z.array(ipcCommandSchema),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const settingsGetRequestSchema = z.object({}).strict();
export const settingsSetRequestSchema = z
  .object({
    ...settingFields,
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine(validateGenericSettingValue);
export const appInfoRequestSchema = z.object({}).strict();
export const appInfoResponseSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    now: z.iso.datetime(),
  })
  .strict();
export type AppInfo = z.infer<typeof appInfoResponseSchema>;

export type CommandsApplyRequest = z.input<typeof commandsApplyRequestSchema>;
export type SettingsSetRequest = z.input<typeof settingsSetRequestSchema>;
export type ThemeChoiceRequest = z.infer<typeof appearanceThemeRequestSchema>;
