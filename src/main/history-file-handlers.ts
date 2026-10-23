import type {
  BackupVerifyResult,
  ExportInfo,
  IpcHistoryEntry,
  IpcSnapshot,
} from '../shared/contracts';
import type { Result } from '../shared/ipc-result';
import { createAttachmentHandlers } from './attachment-ipc-handlers';
import { createBackupHandlers } from './backup-ipc-handlers';
import { createHistoryHandlers } from './history-handlers';
import type { HistoryFileDependencies } from './history-file-dependencies';

export type HistoryFileHandlers = {
  historyList(request: unknown): Result<readonly IpcHistoryEntry[]>;
  historyUndo(request: unknown): Result<IpcSnapshot>;
  attachmentsAdd(request: unknown): Promise<Result<IpcSnapshot>>;
  attachmentsOpen(request: unknown): Promise<Result<null>>;
  attachmentsRemove(request: unknown): Result<IpcSnapshot>;
  backupExport(request: unknown): Promise<Result<ExportInfo>>;
  backupVerify(request: unknown): Promise<BackupVerifyResult>;
  backupRestore(request: unknown): Result<IpcSnapshot>;
};

export function createHistoryFileHandlers(
  deps: HistoryFileDependencies,
): HistoryFileHandlers {
  const history = createHistoryHandlers(deps);
  const attachments = createAttachmentHandlers(deps);
  const backup = createBackupHandlers(deps);
  return {
    historyList: history.list,
    historyUndo: history.undo,
    attachmentsAdd: attachments.add,
    attachmentsOpen: attachments.open,
    attachmentsRemove: attachments.remove,
    backupExport: backup.export,
    backupVerify: backup.verify,
    backupRestore: backup.restore,
  };
}
