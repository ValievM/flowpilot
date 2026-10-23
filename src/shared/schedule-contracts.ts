import { z } from 'zod';
import type { ScheduleSourceSnapshot } from '../storage';

export type {
  ManualScheduleEvent,
  ScheduleEvent,
  ScheduleSourceSnapshot,
} from '../storage';

export const scheduleEmptyRequestSchema = z.object({}).strict();
export const scheduleConfirmRequestSchema = z
  .object({ token: z.string().min(1) })
  .strict();

export type ScheduleProblem = {
  readonly line: number;
  readonly reason: string;
};

/** What the person is about to load: shown before anything is stored. */
export type SchedulePreview = {
  readonly token: string;
  readonly found: number;
  readonly problemCount: number;
  readonly problems: readonly ScheduleProblem[];
  readonly firstDate: string | null;
  readonly lastDate: string | null;
};

export type ScheduleSnapshots = readonly ScheduleSourceSnapshot[];

export type ScheduleResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error:
        | {
            readonly kind:
              | 'Cancelled'
              | 'TooLarge'
              | 'NotFound'
              | 'ValidationFailed'
              | 'StaleRevision'
              | 'InternalError';
          }
        | {
            readonly kind: 'IcsInvalid';
            readonly problems: readonly ScheduleProblem[];
          };
    };

export type ScheduleApi = {
  list(): Promise<ScheduleResult<ScheduleSnapshots>>;
  importFile(): Promise<ScheduleResult<SchedulePreview>>;
  confirmImport(request: {
    token: string;
  }): Promise<ScheduleResult<ScheduleSnapshots>>;
};
