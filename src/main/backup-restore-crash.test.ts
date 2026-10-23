import type * as storageModule from '../storage';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Repository } from '../storage';
import { createHistoryFileHandlers } from './history-file-handlers';

vi.mock('../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof storageModule>();
  return {
    ...actual,
    restore(): storageModule.BackupResult {
      throw new Error('сбой восстановления после закрытия профиля');
    },
  };
});

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function makeSystem() {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-restore-crash-'));
  directories.push(directory);
  let repository = new Repository(join(directory, 'flowpilot.db'), clock);
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
    profilePath: join(directory, 'flowpilot.db'),
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
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('backup restore IPC crash safety', () => {
  it('reopens the repository and returns NotReadable when restore throws', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const exportParent = join(system.directory, 'exports');
    mkdirSync(exportParent);
    system.dialogState.folder = exportParent;
    await system.handlers.backupExport({});
    system.dialogState.folder = join(
      exportParent,
      readdirSync(exportParent)[0] ?? '',
    );
    const verified = await system.handlers.backupVerify({});
    if (!verified.ok) throw new Error('The exported package should verify');
    const before = system.repository().load();

    const result = system.handlers.backupRestore({
      packageToken: verified.value.packageToken,
    });

    expect(result).toEqual({ ok: false, error: 'NotReadable' });
    expect(system.repository().load()).toEqual(before);
    expect(
      system.handlers.backupRestore({
        packageToken: verified.value.packageToken,
      }),
    ).toEqual({ ok: false, error: 'NotReadable' });
    system.repository().close();
  });
});
