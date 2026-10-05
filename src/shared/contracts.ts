import { z } from 'zod';
import { commandSchema } from './command-schema';
import type { Task, TaskStatus } from '../domain';
import type { Snapshot } from '../storage';
import type { Result } from './ipc-result';
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
} as const;

export const snapshotLoadRequestSchema = z.object({}).strict();
export const commandsApplyRequestSchema = z
  .object({
    commands: z.array(commandSchema),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const settingsGetRequestSchema = z.object({}).strict();
export const settingsSetRequestSchema = z
  .object({
    key: z.string().min(1),
    value: z.unknown(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.key === 'workdays' &&
      !z
        .array(z.number().int().min(1).max(7))
        .min(1)
        .max(7)
        .refine((days) => new Set(days).size === days.length)
        .safeParse(request.value).success
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid workdays' });
    }
  });
export const appInfoRequestSchema = z.object({}).strict();

export type CommandsApplyRequest = z.input<typeof commandsApplyRequestSchema>;
export type SettingsSetRequest = z.input<typeof settingsSetRequestSchema>;
export type FlowPilotApi = {
  snapshot: { load(): Promise<Result<IpcSnapshot>> };
  commands: {
    apply(request: CommandsApplyRequest): Promise<Result<IpcSnapshot>>;
  };
  settings: {
    get(): Promise<Result<Readonly<Record<string, unknown>>>>;
    set(request: SettingsSetRequest): Promise<Result<IpcSnapshot>>;
  };
  app: {
    info(): Promise<Result<{ name: string; version: string }>>;
  };
};
