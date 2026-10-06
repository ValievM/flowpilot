import { z } from 'zod';
import {
  ipcCommandSchema,
  settingFields,
  validateGenericSettingValue,
} from './command-schema';
import type { Task, TaskStatus } from '../domain';
import type { Snapshot } from '../storage';
import type { Result } from './ipc-result';
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
type SerializedTask = Omit<
  Task,
  'day' | 'time' | 'deadline' | 'rolledOverFrom' | 'status'
> & {
  readonly day?: string;
  readonly time?: string;
  readonly deadline?: string;
  readonly rolledOverFrom?: string;
  readonly status: IpcTaskStatus;
};
export type IpcSnapshot = Omit<Snapshot, 'tasks'> & {
  readonly tasks: readonly SerializedTask[];
};

export const ipcChannels = {
  snapshotLoad: 'snapshot.load',
  commandsApply: 'commands.apply',
  settingsGet: 'settings.get',
  settingsSet: 'settings.set',
  appInfo: 'app.info',
  aiRun: 'ai.run',
  aiCancel: 'ai.cancel',
  aiPrompt: 'ai.prompt',
  aiReply: 'ai.reply',
  appearanceSetTheme: 'appearance.set-theme',
  appearanceInitialize: 'appearance.initialize',
  appearanceReady: 'appearance.ready',
} as const;
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

export type FlowPilotApi = {
  appearance: {
    initialize(
      request: AppearanceInitializeRequest,
    ): Promise<Result<ThemeChoice>>;
    ready(): Promise<void>;
    setTheme(request: ThemeChoiceRequest): Promise<Result<null>>;
  };
  snapshot: { load(): Promise<Result<IpcSnapshot>> };
  commands: {
    apply(request: CommandsApplyRequest): Promise<Result<IpcSnapshot>>;
  };
  settings: {
    get(): Promise<Result<Readonly<Record<string, unknown>>>>;
    set(request: SettingsSetRequest): Promise<Result<IpcSnapshot>>;
  };
  ai: {
    run(request: AiIpcRequest): Promise<AiIpcResult>;
    cancel(request: { operationId: string }): Promise<AiCancelResult>;
    prompt(request: { operationId: string }): Promise<Result<string>>;
    reply(request: {
      operationId: string;
      text: string;
    }): Promise<AiManualReplyResult>;
  };
  app: {
    info(): Promise<Result<AppInfo>>;
  };
};
