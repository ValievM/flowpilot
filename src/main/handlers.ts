import type { Repository, Snapshot, StorageCommand } from '../storage';
import {
  appInfoRequestSchema,
  appInfoResponseSchema,
  commandsApplyRequestSchema,
  settingsGetRequestSchema,
  settingsSetRequestSchema,
  snapshotLoadRequestSchema,
  type AppInfo,
  type IpcSnapshot,
} from '../shared/contracts';
import type { ErrorCode, Result } from '../shared/ipc-result';

type RepositoryDependency = { repository: Repository };

export function loadSnapshot(
  request: unknown,
  deps: RepositoryDependency,
): Result<IpcSnapshot> {
  if (!snapshotLoadRequestSchema.safeParse(request).success)
    return { ok: false, error: 'ValidationFailed' };
  try {
    return {
      ok: true,
      value: serializeSnapshot(deps.repository.load()),
    };
  } catch {
    return { ok: false, error: 'InternalError' };
  }
}

export function applyCommands(
  request: unknown,
  deps: RepositoryDependency,
): Result<IpcSnapshot> {
  const parsed = commandsApplyRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  try {
    // Zod validates the command and converts ISO dates into Temporal values.
    const commands = parsed.data
      .commands as unknown as readonly StorageCommand[];
    const result = deps.repository.apply(
      commands,
      parsed.data.expectedRevision,
    );
    if (!result.ok)
      return { ok: false, error: mapApplyError(result.error.kind) };
    return {
      ok: true,
      value: serializeSnapshot(deps.repository.load()),
    };
  } catch {
    return { ok: false, error: 'InternalError' };
  }
}

export function getSettings(
  request: unknown,
  deps: RepositoryDependency,
): Result<Readonly<Record<string, unknown>>> {
  if (!settingsGetRequestSchema.safeParse(request).success)
    return { ok: false, error: 'ValidationFailed' };
  try {
    return { ok: true, value: deps.repository.load().settings };
  } catch {
    return { ok: false, error: 'InternalError' };
  }
}

export function setSetting(
  request: unknown,
  deps: RepositoryDependency,
): Result<IpcSnapshot> {
  const parsed = settingsSetRequestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  try {
    const result = deps.repository.apply(
      [
        {
          kind: 'setting.set',
          key: parsed.data.key,
          value: parsed.data.value,
        },
      ],
      parsed.data.expectedRevision,
    );
    if (!result.ok)
      return { ok: false, error: mapApplyError(result.error.kind) };
    return {
      ok: true,
      value: serializeSnapshot(deps.repository.load()),
    };
  } catch {
    return { ok: false, error: 'InternalError' };
  }
}

export function getAppInfo(
  request: unknown,
  deps: {
    getName(): string;
    getVersion(): string;
    getNow(): string;
  },
): Result<AppInfo> {
  if (!appInfoRequestSchema.safeParse(request).success)
    return { ok: false, error: 'ValidationFailed' };
  try {
    const result = appInfoResponseSchema.safeParse({
      name: deps.getName(),
      version: deps.getVersion(),
      now: deps.getNow(),
    });
    return result.success
      ? { ok: true, value: result.data }
      : { ok: false, error: 'InternalError' };
  } catch {
    return { ok: false, error: 'InternalError' };
  }
}

function serializeSnapshot(snapshot: Snapshot): IpcSnapshot {
  return {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => {
      const {
        day,
        time,
        deadline,
        rolledOverFrom,
        status,
        comments,
        ...taskFields
      } = task;
      const serializedStatus: IpcSnapshot['tasks'][number]['status'] =
        status.kind === 'waiting'
          ? status.until
            ? {
                kind: 'waiting',
                reason: status.reason,
                until: status.until.toString(),
              }
            : { kind: 'waiting', reason: status.reason }
          : status;
      return {
        ...taskFields,
        comments: comments.map(({ createdAt, ...comment }) => ({
          ...comment,
          createdAt: createdAt?.toString() ?? null,
        })),
        status: serializedStatus,
        ...(day ? { day: day.toString() } : {}),
        ...(time ? { time: time.toString() } : {}),
        ...(deadline ? { deadline: deadline.toString() } : {}),
        ...(rolledOverFrom
          ? { rolledOverFrom: rolledOverFrom.toString() }
          : {}),
      };
    }),
    series: snapshot.series.map(({ startsOn, endsOn, time, ...series }) => ({
      ...series,
      startsOn: startsOn.toString(),
      ...(endsOn ? { endsOn: endsOn.toString() } : {}),
      ...(time ? { time: time.toString() } : {}),
    })),
    outcomes: snapshot.outcomes.map(serializeOutcome),
  };
}
function serializeOutcome(
  outcome: Snapshot['outcomes'][number],
): IpcSnapshot['outcomes'][number] {
  const base = {
    seriesId: outcome.seriesId,
    date: outcome.date.toString(),
    recordedAt: outcome.recordedAt.toString(),
  };
  if (outcome.kind !== 'rescheduled') return { ...base, kind: outcome.kind };
  return {
    ...base,
    kind: outcome.kind,
    newDate: outcome.newDate.toString(),
    newTime: outcome.newTime.toString(),
  };
}
function mapApplyError(kind: 'StaleRevision' | 'InvalidCommand'): ErrorCode {
  return kind === 'StaleRevision' ? 'StaleRevision' : 'ValidationFailed';
}
