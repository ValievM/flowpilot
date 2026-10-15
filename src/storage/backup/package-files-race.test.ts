import {
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nativeOpen from '@flowpilot/openat';
import { Repository } from '../repository';
import type { Clock } from '../types';
import { exportTo, restore, verifyPackage } from './backup';

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
  subtasks: [],
  comments: [],
  attachments: [],
  addedOrder: 1,
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function attachedProfile(): {
  root: string;
  profile: string;
  attachmentId: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'flowpilot-backup-race-'));
  directories.push(root);
  const profile = join(root, 'profile.sqlite');
  const repository = new Repository(profile, clock);
  const created = repository.apply([{ kind: 'task.create', task }], 0);
  if (!created.ok) throw new Error('Could not create the attachment task');
  const sourcePath = join(root, 'safe.txt');
  writeFileSync(sourcePath, 'safe attachment bytes');
  const added = repository.apply(
    [{ kind: 'attachment.add', taskId: task.id, sourcePath }],
    1,
  );
  if (!added.ok) throw new Error('Could not create the attachment fixture');
  const attachmentId = repository.load().tasks[0]?.attachments[0]?.id;
  repository.close();
  if (!attachmentId) throw new Error('Missing attachment fixture');
  return { root, profile, attachmentId };
}

function exportPackage(root: string, profile: string): string {
  const result = exportTo(root, profile, clock);
  if (!result.ok) throw new Error(result.error);
  return result.value.folderPath;
}

type ParentRace<T> = {
  value: T;
  raced: boolean;
  externalOpened: boolean;
};

type ParentSwapOptions<T> = {
  targetPath: string;
  parentPath: string;
  externalDirectory: string;
  targetOpen: number;
  operation: () => T;
};

function withParentSwap<T>({
  targetPath,
  parentPath,
  externalDirectory,
  targetOpen,
  operation,
}: ParentSwapOptions<T>): ParentRace<T> {
  const movedParent = `${parentPath}.held`;
  const externalFile = join(externalDirectory, basename(targetPath));
  const originalOpenAt = nativeOpen.openAt.bind(nativeOpen);
  let targetOpens = 0;
  const state = { symlinkInstalled: false };
  let raced = false;
  let externalOpened = false;
  const openSpy = vi
    .spyOn(nativeOpen, 'openAt')
    .mockImplementation((directoryFd, name, flags, mode) => {
      if (name !== basename(targetPath)) {
        return originalOpenAt(directoryFd, name, flags, mode);
      }
      targetOpens += 1;
      if (targetOpens !== targetOpen) {
        return originalOpenAt(directoryFd, name, flags, mode);
      }
      renameSync(parentPath, movedParent);
      state.symlinkInstalled = true;
      symlinkSync(externalDirectory, parentPath);
      raced = true;
      try {
        const descriptor = originalOpenAt(directoryFd, name, flags, mode);
        const outside = lstatSync(externalFile);
        const opened = fstatSync(descriptor);
        externalOpened =
          opened.dev === outside.dev && opened.ino === outside.ino;
        return descriptor;
      } finally {
        rmSync(parentPath, { force: true });
        renameSync(movedParent, parentPath);
        state.symlinkInstalled = false;
      }
    });
  try {
    return { value: operation(), raced, externalOpened };
  } finally {
    if (state.symlinkInstalled) {
      rmSync(parentPath, { force: true });
      renameSync(movedParent, parentPath);
    }
    openSpy.mockRestore();
  }
}

describe('backup package descriptor-relative attachment access', () => {
  it('keeps verification rooted when an attachment parent is swapped mid-open', () => {
    const { root, profile, attachmentId } = attachedProfile();
    const packageDir = exportPackage(root, profile);
    const parentPath = join(packageDir, 'attachments');
    const targetPath = join(parentPath, attachmentId);
    const externalDirectory = join(root, 'race-external');
    mkdirSync(externalDirectory);
    writeFileSync(join(externalDirectory, attachmentId), 'outside bytes');

    const race = withParentSwap({
      targetPath,
      parentPath,
      externalDirectory,
      targetOpen: 2,
      operation: () => verifyPackage(packageDir),
    });
    expect(race.raced).toBe(true);
    expect(race.externalOpened).toBe(false);
    expect(race.value.ok).toBe(true);
  });

  it('keeps restore rooted when an attachment parent is swapped mid-open', () => {
    const { root, profile, attachmentId } = attachedProfile();
    const packageDir = exportPackage(root, profile);
    const parentPath = join(packageDir, 'attachments');
    const targetPath = join(parentPath, attachmentId);
    const externalDirectory = join(root, 'restore-race-external');
    mkdirSync(externalDirectory);
    writeFileSync(
      join(externalDirectory, attachmentId),
      'evil attachment bytes',
    );
    const targetProfile = join(root, 'restored.sqlite');

    const race = withParentSwap({
      targetPath,
      parentPath,
      externalDirectory,
      targetOpen: 3,
      operation: () => restore(packageDir, targetProfile, clock),
    });
    expect(race.raced).toBe(true);
    expect(race.externalOpened).toBe(false);
    expect(race.value.ok).toBe(true);
    expect(readFileSync(join(root, 'attachments', attachmentId), 'utf8')).toBe(
      'safe attachment bytes',
    );
  });

  it('keeps export rooted when the profile attachment parent is swapped mid-open', () => {
    const { root, profile, attachmentId } = attachedProfile();
    const parentPath = join(root, 'attachments');
    const targetPath = join(parentPath, attachmentId);
    const externalDirectory = join(root, 'export-race-external');
    mkdirSync(externalDirectory);
    writeFileSync(
      join(externalDirectory, attachmentId),
      'evil attachment bytes',
    );

    const race = withParentSwap({
      targetPath,
      parentPath,
      externalDirectory,
      targetOpen: 2,
      operation: () => exportTo(root, profile, clock),
    });
    expect(race.raced).toBe(true);
    expect(race.externalOpened).toBe(false);
    expect(race.value.ok).toBe(true);
    if (!race.value.ok)
      throw new Error('Safe attachment export should succeed');
    expect(
      readFileSync(
        join(race.value.value.folderPath, 'attachments', attachmentId),
        'utf8',
      ),
    ).toBe('safe attachment bytes');
  });
});
