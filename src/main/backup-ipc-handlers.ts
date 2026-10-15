import { randomUUID } from 'node:crypto';
import {
  backupExportRequestSchema,
  backupRestoreRequestSchema,
  backupVerifyRequestSchema,
  type BackupVerifyResult,
  type IpcSnapshot,
} from '../shared/contracts';
import type { ErrorCode, Result } from '../shared/ipc-result';
import {
  exportTo,
  Repository,
  restore,
  rollbackRestoredProfile,
  verifyPackage,
  type BackupResult,
  type RestoredProfileBackup,
} from '../storage';
import type { HistoryFileDependencies } from './history-file-dependencies';
import { loadSnapshot } from './handlers';

export function createBackupHandlers(deps: HistoryFileDependencies) {
  const verifiedPackages = new Map<string, string>();
  const makeToken = deps.makeToken ?? randomUUID;
  return {
    export: (request: unknown) => exportBackup(request, deps),
    verify: (request: unknown) =>
      verifyBackup(request, deps, verifiedPackages, makeToken),
    restore: (request: unknown) =>
      restoreBackup(request, deps, verifiedPackages),
  };
}

async function exportBackup(
  request: unknown,
  deps: HistoryFileDependencies,
): Promise<Result<null>> {
  if (!backupExportRequestSchema.safeParse(request).success)
    return failure('ValidationFailed');
  const parentPath = await deps.dialogs.pickFolder();
  if (!parentPath) return failure('Cancelled');
  const result = exportTo(parentPath, deps.profilePath, deps.clock);
  return result.ok ? { ok: true, value: null } : failure('NotReadable');
}

async function verifyBackup(
  request: unknown,
  deps: HistoryFileDependencies,
  verifiedPackages: Map<string, string>,
  makeToken: () => string,
): Promise<BackupVerifyResult> {
  if (!backupVerifyRequestSchema.safeParse(request).success)
    return { ok: false, error: 'ValidationFailed' };
  const packagePath = await deps.dialogs.pickFolder();
  if (!packagePath) return { ok: false, error: 'Cancelled' };
  const verification = verifyPackage(packagePath);
  if (!verification.ok)
    return {
      ok: false,
      error: 'PackageInvalid',
      problems: verification.problems,
    };
  const packageToken = makeToken();
  verifiedPackages.set(packageToken, packagePath);
  return { ok: true, value: { packageToken, problems: [] } };
}

function restoreBackup(
  request: unknown,
  deps: HistoryFileDependencies,
  verifiedPackages: Map<string, string>,
): Result<IpcSnapshot> {
  const parsed = backupRestoreRequestSchema.safeParse(request);
  if (!parsed.success) return failure('ValidationFailed');
  const packagePath = verifiedPackages.get(parsed.data.packageToken);
  if (!packagePath) return failure('PackageInvalid');
  const current = deps.repositories.current();
  current.close();
  const restored = runRestore(packagePath, deps);
  const reopened = reopenRepository(deps, restored);
  if (!reopened.ok) return failure('NotReadable');
  deps.repositories.replace(reopened.repository);
  if (reopened.rolledBack) return failure('NotReadable');
  if (!restored.ok)
    return failure(
      restored.kind === 'PackageInvalid' ? 'PackageInvalid' : 'NotReadable',
    );
  verifiedPackages.delete(parsed.data.packageToken);
  return loadSnapshot({}, { repository: reopened.repository });
}

function runRestore(
  packagePath: string,
  deps: HistoryFileDependencies,
): BackupResult {
  try {
    return restore(packagePath, deps.profilePath, deps.clock);
  } catch (error) {
    return {
      ok: false,
      kind: 'OperationalFailure',
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    };
  }
}

type ReopenOutcome =
  | {
      readonly ok: true;
      readonly repository: Repository;
      readonly rolledBack: boolean;
    }
  | { readonly ok: false };

function reopenRepository(
  deps: HistoryFileDependencies,
  restored: BackupResult,
): ReopenOutcome {
  try {
    return {
      ok: true,
      repository: new Repository(deps.profilePath, deps.clock),
      rolledBack: false,
    };
  } catch {
    const backup = 'backup' in restored ? restored.backup : undefined;
    if (!backup) return { ok: false };
    return reopenRolledBackProfile(deps, backup);
  }
}

function reopenRolledBackProfile(
  deps: HistoryFileDependencies,
  backup: RestoredProfileBackup,
): ReopenOutcome {
  try {
    rollbackRestoredProfile({
      profilePath: deps.profilePath,
      backupDb: backup.db,
      backupAttachments: backup.attachments,
    });
    return {
      ok: true,
      repository: new Repository(deps.profilePath, deps.clock),
      rolledBack: true,
    };
  } catch {
    return { ok: false };
  }
}

function failure<T>(error: ErrorCode): Result<T> {
  return { ok: false, error };
}
