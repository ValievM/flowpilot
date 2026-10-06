import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import type { Clock } from '../types';
import type { BackupResult } from './backup-types';
import { verifyPackage } from './package-verify';
import { buildProfile } from './profile-build';

const BUILD_CLOCK: Clock = {
  now: () => Temporal.Instant.from('2000-01-01T00:00:00Z'),
};
type RestorePaths = {
  profilePath: string;
  stagedDb: string;
  stagedAttachments: string;
  stageDir: string;
  oldDb: string;
  oldAttachments: string;
  attachmentDir: string;
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
      error: verification.problems
        .map((item) => `${item.path}: ${item.message}`)
        .join('; '),
    };
  let paths: RestorePaths;
  try {
    paths = makePaths(profilePath, clock);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  const state: ReplacementState = {
    movedDb: false,
    movedAttachments: false,
    installedDb: false,
    installedAttachments: false,
  };
  try {
    buildProfile({
      dir,
      stagedDb: paths.stagedDb,
      stagedAttachments: paths.stagedAttachments,
      data: verification.value.data,
      clock,
      buildClock: BUILD_CLOCK,
    });
    replaceProfile(paths, state);
    return {
      ok: true,
      value: `Профиль восстановлен. Прежние данные сохранены здесь: ${paths.oldDb}`,
    };
  } catch (error) {
    rollbackProfile(paths, state);
    return { ok: false, error: errorMessage(error) };
  } finally {
    rmSync(paths.stageDir, { recursive: true, force: true });
  }
}

function makePaths(profilePath: string, clock: Clock): RestorePaths {
  const timestamp = clock.now().toString().replaceAll(':', '-');
  const parent = dirname(profilePath);
  const stageDir = mkdtempSync(join(parent, '.restore-stage-'));
  return {
    profilePath,
    stagedDb: join(stageDir, 'profile.sqlite'),
    stagedAttachments: join(stageDir, 'attachments'),
    stageDir,
    oldDb: `${profilePath}.before-restore-${timestamp}`,
    oldAttachments: join(parent, `attachments.before-restore-${timestamp}`),
    attachmentDir: join(parent, 'attachments'),
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
