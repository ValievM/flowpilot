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
import type * as profileBuildModule from '../storage/backup/profile-build';
import type * as storageModule from '../storage';
import { Repository } from '../storage';
import { createHistoryFileHandlers } from './history-file-handlers';

const stage = vi.hoisted(
  (): {
    profilePath?: string | undefined;
    failNextOpen: boolean;
    failCleanup: boolean;
    lockedDirs: string[];
  } => ({
    failNextOpen: false,
    failCleanup: false,
    lockedDirs: [],
  }),
);
vi.mock('../storage/backup/profile-build', async (importOriginal) => {
  const actual = await importOriginal<typeof profileBuildModule>();
  return {
    ...actual,
    buildProfile(input: Parameters<typeof actual.buildProfile>[0]): void {
      actual.buildProfile(input);
      if (!stage.failCleanup) return;
      stage.failCleanup = false;
      const locked = join(dirname(input.stagedDb), 'locked-stage');
      mkdirSync(locked, { recursive: true });
      writeFileSync(join(locked, 'keep.txt'), 'занято');
      chmodSync(locked, 0o500);
      stage.lockedDirs.push(locked);
    },
  };
});

vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof storageModule>();
  class FailingRepository extends actual.Repository {
    constructor(
      path: string,
      clock: ConstructorParameters<typeof actual.Repository>[1],
    ) {
      if (stage.failNextOpen && path === stage.profilePath) {
        stage.failNextOpen = false;
        throw new Error('повторное открытие профиля не удалось');
      }
      super(path, clock);
    }
  }
  return { ...actual, Repository: FailingRepository };
});

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function makeSystem() {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-restore-reopen-'));
  directories.push(directory);
  const profilePath = join(directory, 'flowpilot.db');
  let repository = new Repository(profilePath, clock);
  const dialogState: { file?: string; folder?: string } = {};
  const handlers = createHistoryFileHandlers({
    dialogs: {
      pickFile: () => Promise.resolve(dialogState.file),
      pickFolder: () => Promise.resolve(dialogState.folder),
    },
    repositories: {
      current: () => repository,
      replace: (next) => {
        repository = next;
      },
    },
    shell: {
      open: () => Promise.resolve(''),
    },
    profilePath,
    clock,
    makeToken: () => 'verified-package-token',
  });
  return { directory, handlers, dialogState, repository: () => repository };
}

function addTask(repository: Repository, id: string, expectedRevision: number) {
  const task = {
    id,
    title: id,
    description: '',
    status: { kind: 'todo' as const },
    columnId: 'todo',
    day: Temporal.PlainDate.from('2026-10-05'),
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: expectedRevision,
  };
  return repository.apply([{ kind: 'task.create', task }], expectedRevision);
}

afterEach(() => {
  stage.failNextOpen = false;
  stage.profilePath = undefined;
  stage.failCleanup = false;
  for (const locked of stage.lockedDirs.splice(0)) chmodSync(locked, 0o700);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('backup restore repository reopen crash safety', () => {
  it('returns NotReadable and rolls back when the reopened repository fails', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const exportParent = join(system.directory, 'exports');
    mkdirSync(exportParent);
    system.dialogState.folder = exportParent;
    await system.handlers.backupExport({});
    system
      .repository()
      .apply(
        [{ kind: 'task.update', id: 'task-1', changes: { title: 'Changed' } }],
        1,
      );
    system.dialogState.folder = join(
      exportParent,
      readdirSync(exportParent)[0] ?? '',
    );
    const verified = await system.handlers.backupVerify({});
    if (!verified.ok) throw new Error('The exported package should verify');
    const before = system.repository().load();
    stage.profilePath = join(system.directory, 'flowpilot.db');
    stage.failNextOpen = true;

    const result = system.handlers.backupRestore({
      packageToken: verified.value.packageToken,
    });

    expect(result).toEqual({ ok: false, error: 'NotReadable' });
    expect(system.repository().load()).toEqual(before);
    expect(system.handlers.historyList({ limit: 10 }).ok).toBe(true);
    expect(
      readdirSync(system.directory).some((name) =>
        name.includes('before-restore'),
      ),
    ).toBe(false);
    const retry = system.handlers.backupRestore({
      packageToken: verified.value.packageToken,
    });
    expect(retry).toMatchObject({
      ok: true,
      value: { tasks: [{ id: 'task-1', title: 'task-1' }] },
    });
    system.repository().close();
  });
  it('rolls back to a live repository when stage cleanup and reopen both fail', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const exportParent = join(system.directory, 'exports');
    mkdirSync(exportParent);
    system.dialogState.folder = exportParent;
    await system.handlers.backupExport({});
    system
      .repository()
      .apply(
        [{ kind: 'task.update', id: 'task-1', changes: { title: 'Changed' } }],
        1,
      );
    system.dialogState.folder = join(
      exportParent,
      readdirSync(exportParent)[0] ?? '',
    );
    const verified = await system.handlers.backupVerify({});
    if (!verified.ok) throw new Error('The exported package should verify');
    stage.profilePath = join(system.directory, 'flowpilot.db');
    stage.failNextOpen = true;
    stage.failCleanup = true;

    const result = system.handlers.backupRestore({
      packageToken: verified.value.packageToken,
    });

    expect(result).toEqual({ ok: false, error: 'NotReadable' });
    expect(stage.failNextOpen).toBe(false);
    expect(stage.lockedDirs).toHaveLength(1);
    expect(
      readdirSync(system.directory).some((name) =>
        name.includes('.restore-stage-'),
      ),
    ).toBe(true);
    expect(system.repository().load().tasks[0]?.title).toBe('Changed');
    expect(system.handlers.historyList({ limit: 10 }).ok).toBe(true);
    expect(
      readdirSync(system.directory).some((name) =>
        name.includes('before-restore'),
      ),
    ).toBe(false);
    system.repository().close();
  });
});
