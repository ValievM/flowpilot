import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Clock } from '../types';
import type { BackupResult } from './backup-types';
import { verifyPackage } from './package-verify';
import { buildProfile } from './profile-build';

type RestorePaths = {
  profilePath: string;
  stagedDb: string;
  stagedAttachments: string;
  stageDir: string;
  oldDb: string;
  oldAttachments: string;
  attachmentDir: string;
  backupPath: string | undefined;
};
type ReplacementState = {
  movedDb: boolean;
  movedAttachments: boolean;
  installedDb: boolean;
  installedAttachments: boolean;
};

export function restore(
  dir: string,
  profilePath: string,
  clock: Clock,
): BackupResult {
  const verification = verifyPackage(dir);
  if (!verification.ok)
    return {
      ok: false,
      kind: 'PackageInvalid',
      error: verification.problems
        .map((item) => `${item.path}: ${item.message}`)
        .join('; '),
    };
  let paths: RestorePaths;
  let restoredAt: string;
  try {
    const instant = clock.now();
    restoredAt = instant.toString();
    paths = makePaths(profilePath, instant.toString().replaceAll(':', '-'));
  } catch (error) {
    return {
      ok: false,
      kind: 'OperationalFailure',
      error: errorMessage(error),
    };
  }
  return buildAndReplace({
    dir,
    paths,
    data: verification.value.data,
    clock,
    restoredAt,
  });
}
function buildAndReplace(input: {
  dir: string;
  paths: RestorePaths;
  data: Parameters<typeof buildProfile>[0]['data'];
  clock: Clock;
  restoredAt: string;
}): BackupResult {
  const state: ReplacementState = {
    movedDb: false,
    movedAttachments: false,
    installedDb: false,
    installedAttachments: false,
  };
  try {
    buildProfile({
      dir: input.dir,
      stagedDb: input.paths.stagedDb,
      stagedAttachments: input.paths.stagedAttachments,
      data: input.data,
      buildClock: input.clock,
      restoredAt: input.restoredAt,
      backupPath: input.paths.backupPath,
    });
    replaceProfile(input.paths, state);
    return {
      ok: true,
      value: input.paths.backupPath
        ? `Профиль восстановлен. Прежние данные сохранены здесь: ${input.paths.backupPath}`
        : 'Профиль восстановлен; прежнего профиля для резервного копирования не было.',
    };
  } catch (error) {
    rollbackProfile(input.paths, state);
    return {
      ok: false,
      kind: 'OperationalFailure',
      error: errorMessage(error),
    };
  } finally {
    rmSync(input.paths.stageDir, { recursive: true, force: true });
  }
}

function makePaths(profilePath: string, timestamp: string): RestorePaths {
  const parent = dirname(profilePath);
  const stageDir = mkdtempSync(join(parent, '.restore-stage-'));
  const oldDb = `${profilePath}.before-restore-${timestamp}`;
  return {
    profilePath,
    stagedDb: join(stageDir, 'profile.sqlite'),
    stagedAttachments: join(stageDir, 'attachments'),
    stageDir,
    oldDb,
    oldAttachments: join(parent, `attachments.before-restore-${timestamp}`),
    attachmentDir: join(parent, 'attachments'),
    backupPath: existsSync(profilePath) ? oldDb : undefined,
  };
}

function replaceProfile(paths: RestorePaths, state: ReplacementState): void {
  if (existsSync(paths.oldDb) || existsSync(paths.oldAttachments))
    throw new Error('Папка предыдущего профиля уже существует');
  if (existsSync(paths.profilePath)) {
    renameSync(paths.profilePath, paths.oldDb);
    state.movedDb = true;
  }
  if (existsSync(paths.attachmentDir)) {
    renameSync(paths.attachmentDir, paths.oldAttachments);
    state.movedAttachments = true;
  }
  renameSync(paths.stagedDb, paths.profilePath);
  state.installedDb = true;
  renameSync(paths.stagedAttachments, paths.attachmentDir);
  state.installedAttachments = true;
}

function rollbackProfile(paths: RestorePaths, state: ReplacementState): void {
  if (state.installedAttachments)
    rmSync(paths.attachmentDir, { recursive: true, force: true });
  if (state.installedDb) rmSync(paths.profilePath, { force: true });
  if (state.movedDb) renameSync(paths.oldDb, paths.profilePath);
  if (state.movedAttachments)
    renameSync(paths.oldAttachments, paths.attachmentDir);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
