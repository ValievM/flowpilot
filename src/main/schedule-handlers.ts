import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { parseIcs } from '../domain/schedule/ics/parse-ics';
import {
  scheduleConfirmRequestSchema,
  scheduleEmptyRequestSchema,
  type ScheduleResult,
  type SchedulePreview,
  type ScheduleSnapshots,
} from '../shared/schedule-contracts';
import type { Clock, Repository, ScheduleEvent } from '../storage';

export const MAX_ICS_FILE_BYTES = 1_048_576;
const PAST_DAYS = 14;
const FUTURE_DAYS = 180;

export type PendingImports = {
  readonly put: (events: readonly ScheduleEvent[]) => string;
  readonly take: (token: string) => readonly ScheduleEvent[] | undefined;
};

export function createPendingImports(
  newToken: () => string = randomUUID,
): PendingImports {
  const pending = new Map<string, readonly ScheduleEvent[]>();
  return {
    put: (events) => {
      const token = newToken();
      pending.set(token, events);
      return token;
    },
    take: (token) => {
      const events = pending.get(token);
      pending.delete(token);
      return events;
    },
  };
}

export type ScheduleDependencies = {
  readonly repository: Repository;
  readonly dialogs: { openIcsFile(): Promise<string | undefined> };
  readonly files?: { size(path: string): number; read(path: string): string };
  readonly clock: Clock;
  readonly timeZone: string;
  readonly pending: PendingImports;
};

const nodeFiles = {
  size: (path: string) => statSync(path).size,
  read: (path: string) => readFileSync(path, 'utf8'),
};

const invalid = {
  ok: false,
  error: { kind: 'ValidationFailed' },
} as const;

export function listSchedule(
  request: unknown,
  deps: Pick<ScheduleDependencies, 'repository'>,
): ScheduleResult<ScheduleSnapshots> {
  if (!scheduleEmptyRequestSchema.safeParse(request).success) return invalid;
  return { ok: true, value: deps.repository.schedule.snapshots() };
}

export async function previewIcsFile(
  request: unknown,
  deps: ScheduleDependencies,
): Promise<ScheduleResult<SchedulePreview>> {
  if (!scheduleEmptyRequestSchema.safeParse(request).success) return invalid;
  try {
    const selected = await deps.dialogs.openIcsFile();
    if (!selected) return { ok: false, error: { kind: 'Cancelled' } };
    if (extname(selected).toLowerCase() !== '.ics')
      return notIcs('Выберите файл календаря с расширением .ics.');
    const files = deps.files ?? nodeFiles;
    if (files.size(selected) > MAX_ICS_FILE_BYTES)
      return { ok: false, error: { kind: 'TooLarge' } };
    return buildPreview(files.read(selected), deps);
  } catch {
    return { ok: false, error: { kind: 'InternalError' } };
  }
}

function notIcs(reason: string): ScheduleResult<never> {
  return {
    ok: false,
    error: { kind: 'IcsInvalid', problems: [{ line: 1, reason }] },
  };
}

function buildPreview(
  text: string,
  deps: ScheduleDependencies,
): ScheduleResult<SchedulePreview> {
  const today = deps.clock
    .now()
    .toZonedDateTimeISO(deps.timeZone)
    .toPlainDate();
  const parsed = parseIcs(text, {
    defaultTimeZone: deps.timeZone,
    from: today.subtract({ days: PAST_DAYS }),
    to: today.add({ days: FUTURE_DAYS }),
  });
  if (parsed.events.length === 0)
    return {
      ok: false,
      error: { kind: 'IcsInvalid', problems: parsed.problems },
    };
  const events: ScheduleEvent[] = parsed.events.map((event) => ({
    key: event.key,
    source: 'ics',
    title: event.title,
    startUtc: event.start.toInstant().toString(),
    endUtc: event.end.toInstant().toString(),
    timeZone: event.start.timeZoneId,
    ...(event.place ? { place: event.place } : {}),
    ...(event.cancelled ? { cancelled: true } : {}),
  }));
  const days = parsed.events
    .map((event) => event.start.toPlainDate())
    .sort((left, right) => Temporal.PlainDate.compare(left, right));
  return {
    ok: true,
    value: {
      token: deps.pending.put(events),
      found: events.length,
      problemCount: parsed.problems.length,
      problems: parsed.problems,
      firstDate: days[0]?.toString() ?? null,
      lastDate: days.at(-1)?.toString() ?? null,
    },
  };
}

export function confirmIcsImport(
  request: unknown,
  deps: ScheduleDependencies,
): ScheduleResult<ScheduleSnapshots> {
  const parsed = scheduleConfirmRequestSchema.safeParse(request);
  if (!parsed.success) return invalid;
  const events = deps.pending.take(parsed.data.token);
  if (!events) return { ok: false, error: { kind: 'NotFound' } };
  const applied = deps.repository.schedule.importSchedule(
    'ics',
    events,
    deps.clock.now().toString(),
    deps.repository.load().revision,
  );
  if (!applied.ok)
    return {
      ok: false,
      error: {
        kind:
          applied.error.kind === 'StaleRevision'
            ? 'StaleRevision'
            : 'InternalError',
      },
    };
  return { ok: true, value: deps.repository.schedule.snapshots() };
}
