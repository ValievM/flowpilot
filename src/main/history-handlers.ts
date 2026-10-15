import {
  historyListRequestSchema,
  historyUndoRequestSchema,
  type IpcHistoryEntry,
  type IpcSnapshot,
} from '../shared/contracts';
import type { ErrorCode, Result } from '../shared/ipc-result';
import { loadSnapshot } from './handlers';
import type { HistoryFileDependencies } from './history-file-dependencies';

export function createHistoryHandlers(deps: HistoryFileDependencies) {
  return {
    list: (request: unknown) => listHistory(request, deps),
    undo: (request: unknown) => undoHistory(request, deps),
  };
}

function listHistory(
  request: unknown,
  deps: HistoryFileDependencies,
): Result<readonly IpcHistoryEntry[]> {
  const parsed = historyListRequestSchema.safeParse(request);
  if (!parsed.success) return failure('ValidationFailed');
  const page = deps.repositories
    .current()
    .history(parsed.data.limit, parsed.data.before);
  return { ok: true, value: page.entries };
}

function undoHistory(
  request: unknown,
  deps: HistoryFileDependencies,
): Result<IpcSnapshot> {
  const parsed = historyUndoRequestSchema.safeParse(request);
  if (!parsed.success) return failure('ValidationFailed');
  const repository = deps.repositories.current();
  const undone = repository.undo(parsed.data.entryId);
  if (!undone.ok) return failure(undoError(undone.error.kind));
  return loadSnapshot({}, { repository });
}

function undoError(kind: string): ErrorCode {
  if (kind === 'UndoConflict') return 'UndoConflict';
  if (kind === 'AlreadyUndone') return 'AlreadyUndone';
  if (kind === 'NotUndoable') return 'NotUndoable';
  return 'NotFound';
}

function failure<T>(error: ErrorCode): Result<T> {
  return { ok: false, error };
}
