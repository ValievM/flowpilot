import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as profileBuild from './profile-build';
import { Repository } from '../repository';
import type { Clock } from '../types';
import { exportTo, restore } from './backup';

type BuildMode = 'real' | 'lockAndSucceed' | 'lockAndThrow';

const stage = vi.hoisted((): { mode: BuildMode; lockedDirs: string[] } => ({
  mode: 'real',
  lockedDirs: [],
}));

vi.mock('./profile-build', async (importOriginal) => {
  const actual = await importOriginal<typeof profileBuild>();
  return {
    ...actual,
    buildProfile(input: Parameters<typeof actual.buildProfile>[0]): void {
      if (stage.mode === 'lockAndThrow') {
        lockStageDir(input.stagedDb);
        throw new Error('первичный сбой сборки профиля');
      }
      actual.buildProfile(input);
      if (stage.mode === 'lockAndSucceed') lockStageDir(input.stagedDb);
    },
  };
});

function lockStageDir(stagedDb: string): void {
  const locked = join(dirname(stagedDb), 'locked-stage');
  mkdirSync(locked, { recursive: true });
  writeFileSync(join(locked, 'keep.txt'), 'занято');
  chmodSync(locked, 0o500);
  stage.lockedDirs.push(locked);
}

const directories: string[] = [];
const clock: Clock = {
  now: () => Temporal.Instant.from('2026-10-06T12:00:00Z'),
};
const task = {
  id: 'task-1',
  title: 'Задача',
  description: 'Текст',
  status: { kind: 'doing' as const },
  columnId: 'doing',
  subtasks: [{ id: 'sub-1', title: 'Шаг', completed: true }],
  comments: [{ id: 'comment-1', text: 'Заметка' }],
  attachments: [],
  addedOrder: 1,
};

function setup(): { root: string; profile: string; repository: Repository } {
  const root = mkdtempSync(join(tmpdir(), 'flowpilot-restore-errors-'));
  directories.push(root);
  const profile = join(root, 'profile.sqlite');
  const repository = new Repository(profile, clock);
  return { root, profile, repository };
}

function exportPackage(root: string, profile: string): string {
  const result = exportTo(root, profile, clock);
  if (!result.ok) throw new Error(result.error);
  return result.value.folderPath;
}

afterEach(() => {
  stage.mode = 'real';
  for (const locked of stage.lockedDirs.splice(0)) chmodSync(locked, 0o700);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('restore stage cleanup failures', () => {
  it('reports an operational failure instead of masking a replaced profile when stage cleanup fails', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const changed = new Repository(profile, clock);
    expect(
      changed.apply(
        [{ kind: 'task.update', id: task.id, changes: { title: 'Изменён' } }],
        1,
      ).ok,
    ).toBe(true);
    changed.close();
    stage.mode = 'lockAndSucceed';

    const result = restore(packageDir, profile, clock);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('restore should report a failure');
    expect(result.kind).toBe('OperationalFailure');
    expect(result.error).toContain('Профиль восстановлен');
    expect(result.error).toContain(
      'не удалось удалить временные файлы восстановления',
    );
    const reopened = new Repository(profile, clock);
    expect('backup' in result && result.backup?.db).toBeTruthy();
    expect(reopened.load().tasks[0]?.title).toBe('Задача');
    reopened.close();
    expect(
      readdirSync(root).some((name) => name.includes('.restore-stage-')),
    ).toBe(true);
  });

  it('keeps the primary failure in the result when cleanup fails after a failed build', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    stage.mode = 'lockAndThrow';

    const result = restore(packageDir, profile, clock);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('restore should report a failure');
    expect(result.kind).toBe('OperationalFailure');
    expect(result.error).toContain('первичный сбой сборки профиля');
    expect(result.error).toContain(
      'не удалось удалить временные файлы восстановления',
    );
    const current = new Repository(profile, clock);
    expect(current.load().tasks).toHaveLength(1);
  });
});
