import { existsSync } from 'node:fs';
import {
  attachmentAddRequestSchema,
  attachmentOpenRequestSchema,
  attachmentRemoveRequestSchema,
  type IpcSnapshot,
} from '../shared/contracts';
import type { ErrorCode, Result } from '../shared/ipc-result';
import { loadSnapshot } from './handlers';
import type { HistoryFileDependencies } from './history-file-dependencies';

export function createAttachmentHandlers(deps: HistoryFileDependencies) {
  return {
    add: (request: unknown) => addAttachment(request, deps),
    open: (request: unknown) => openAttachment(request, deps),
    remove: (request: unknown) => removeAttachment(request, deps),
  };
}

async function addAttachment(
  request: unknown,
  deps: HistoryFileDependencies,
): Promise<Result<IpcSnapshot>> {
  const parsed = attachmentAddRequestSchema.safeParse(request);
  if (!parsed.success) return failure('ValidationFailed');
  const sourcePath = await deps.dialogs.pickFile();
  if (!sourcePath) return failure('Cancelled');
  const repository = deps.repositories.current();
  const result = repository.apply(
    [{ kind: 'attachment.add', taskId: parsed.data.taskId, sourcePath }],
    repository.load().revision,
  );
  if (!result.ok) return failure(attachmentError(result.error));
  return loadSnapshot({}, { repository });
}

async function openAttachment(
  request: unknown,
  deps: HistoryFileDependencies,
): Promise<Result<null>> {
  const parsed = attachmentOpenRequestSchema.safeParse(request);
  if (!parsed.success) return failure('ValidationFailed');
  const path = deps.repositories
    .current()
    .attachmentPath(parsed.data.attachmentId);
  if (!path) return failure('NotFound');
  if (!existsSync(path)) return failure('MissingFile');
  try {
    return (await deps.shell.open(path))
      ? failure('NotReadable')
      : { ok: true, value: null };
  } catch {
    return failure('NotReadable');
  }
}

function removeAttachment(
  request: unknown,
  deps: HistoryFileDependencies,
): Result<IpcSnapshot> {
  const parsed = attachmentRemoveRequestSchema.safeParse(request);
  if (!parsed.success) return failure('ValidationFailed');
  const repository = deps.repositories.current();
  const result = repository.apply(
    [{ kind: 'attachment.remove', attachmentId: parsed.data.attachmentId }],
    repository.load().revision,
  );
  if (!result.ok) return failure(attachmentError(result.error));
  return loadSnapshot({}, { repository });
}

function attachmentError(error: { kind: string }): ErrorCode {
  if (error.kind === 'StaleRevision') return 'StaleRevision';
  if (error.kind === 'NotFound') return 'NotFound';
  if (error.kind === 'FileNotFound') return 'FileNotFound';
  if (error.kind === 'TooLarge') return 'TooLarge';
  if (error.kind === 'NotReadable') return 'NotReadable';
  return 'ValidationFailed';
}

function failure<T>(error: ErrorCode): Result<T> {
  return { ok: false, error };
}
