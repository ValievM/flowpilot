import type Database from 'better-sqlite3';
import { readScheduleSnapshots } from './schedule-commands';
import type {
  ApplyResult,
  Clock,
  ManualScheduleEvent,
  ScheduleCommand,
  ScheduleEvent,
  ScheduleSource,
  ScheduleSourceSnapshot,
} from './types';

type Writer = {
  apply(
    commands: readonly ScheduleCommand[],
    expectedRevision: number,
  ): ApplyResult;
};

/** Schedule commands as plain methods; every one goes through `apply`, so each is one history entry. */
export class ScheduleStore {
  constructor(
    private readonly writer: Writer,
    private readonly database: Database.Database,
    private readonly clock: Clock,
  ) {}

  importSchedule(
    source: ScheduleSource,
    events: readonly ScheduleEvent[],
    fetchedAt: string,
    expectedRevision: number,
  ): ApplyResult {
    return this.writer.apply(
      [{ kind: 'schedule.import', source, events, fetchedAt }],
      expectedRevision,
    );
  }

  recordScheduleError(
    source: ScheduleSource,
    message: string,
    at: string,
    expectedRevision: number,
  ): ApplyResult {
    return this.writer.apply(
      [{ kind: 'schedule.error', source, message, at }],
      expectedRevision,
    );
  }

  addManualEvent(
    event: ManualScheduleEvent,
    expectedRevision: number,
  ): ApplyResult {
    return this.writer.apply(
      [{ kind: 'schedule.manual.add', event, at: this.now() }],
      expectedRevision,
    );
  }

  updateManualEvent(
    id: string,
    event: ManualScheduleEvent,
    expectedRevision: number,
  ): ApplyResult {
    return this.writer.apply(
      [{ kind: 'schedule.manual.update', id, event, at: this.now() }],
      expectedRevision,
    );
  }

  removeManualEvent(id: string, expectedRevision: number): ApplyResult {
    return this.writer.apply(
      [{ kind: 'schedule.manual.remove', id, at: this.now() }],
      expectedRevision,
    );
  }

  snapshots(): readonly ScheduleSourceSnapshot[] {
    return readScheduleSnapshots(this.database, this.clock.now());
  }

  private now(): string {
    return this.clock.now().toString();
  }
}
