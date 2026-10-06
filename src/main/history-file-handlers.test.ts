import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../storage';
import { createHistoryFileHandlers } from './history-file-handlers';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function makeSystem() {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-history-ipc-'));
  directories.push(directory);
  let repository = new Repository(join(directory, 'flowpilot.db'), clock);
  const dialogState: { file?: string; folder?: string } = {};
  const opened: string[] = [];
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
      open: (path) => {
        opened.push(path);
        return Promise.resolve('');
      },
    },
    profilePath: join(directory, 'flowpilot.db'),
    clock,
    makeToken: () => 'verified-package-token',
  });
  return {
    directory,
    handlers,
    dialogState,
    opened,
    repository: () => repository,
  };
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

describe('history and file IPC handlers', () => {
  it('lists applied changes newest first', () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    addTask(system.repository(), 'task-2', 1);
    addTask(system.repository(), 'task-3', 2);

    const page = system.handlers.historyList({ limit: 10 });

    expect(page).toMatchObject({
      ok: true,
      value: [
        { entities: [{ id: 'task-3' }] },
        { entities: [{ id: 'task-2' }] },
        { entities: [{ id: 'task-1' }] },
      ],
    });
    system.repository().close();
  });

  it('undoes the latest change and returns the incremented snapshot', () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);

    const result = system.handlers.historyUndo({});

    expect(result).toMatchObject({
      ok: true,
      value: { revision: 2, tasks: [] },
    });
    const latest = system.repository().history(10).entries[0];
    expect(latest?.source).toBe('undo');
    expect(typeof latest?.undoneEntryId).toBe('string');
    system.repository().close();
  });

  it('preserves changed data when an earlier history entry conflicts', () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const entry = system.repository().history(10).entries[0];
    system
      .repository()
      .apply(
        [{ kind: 'task.update', id: 'task-1', changes: { title: 'Changed' } }],
        1,
      );
    const snapshot = system.repository().load();

    const result = system.handlers.historyUndo({ entryId: entry?.id });

    expect(result).toEqual({ ok: false, error: 'UndoConflict' });
    expect(system.repository().load()).toEqual(snapshot);
    system.repository().close();
  });

  it('adds a dialog-selected attachment through the repository transaction', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const source = join(system.directory, 'notes.txt');
    writeFileSync(source, 'notes');
    system.dialogState.file = source;

    const result = await system.handlers.attachmentsAdd({ taskId: 'task-1' });

    expect(result).toMatchObject({
      ok: true,
      value: { revision: 2, tasks: [{ attachments: [{ name: 'notes.txt' }] }] },
    });
    expect(system.repository().history(10).entries[0]?.entities).toHaveLength(
      1,
    );
    system.repository().close();
  });

  it('cancels attachment selection without changing storage', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const snapshot = system.repository().load();

    const result = await system.handlers.attachmentsAdd({ taskId: 'task-1' });

    expect(result).toEqual({ ok: false, error: 'Cancelled' });
    expect(system.repository().load()).toEqual(snapshot);
    system.repository().close();
  });
  it('removes an attachment through the repository transaction', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const source = join(system.directory, 'notes.txt');
    writeFileSync(source, 'notes');
    system.dialogState.file = source;
    await system.handlers.attachmentsAdd({ taskId: 'task-1' });
    const attachment = system.repository().load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('The attachment should have been added');

    const result = system.handlers.attachmentsRemove({
      attachmentId: attachment.id,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { revision: 3, tasks: [{ attachments: [] }] },
    });
    system.repository().close();
  });

  it('never opens a path for an unknown attachment id', async () => {
    const system = makeSystem();

    const result = await system.handlers.attachmentsOpen({
      attachmentId: 'foreign-id',
    });

    const pathResult = await system.handlers.attachmentsOpen({
      attachmentId: 'foreign-id',
      path: '/private/secret.txt',
    });

    expect(pathResult).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(system.opened).toEqual([]);
    expect(result).toEqual({ ok: false, error: 'NotFound' });
    expect(system.opened).toEqual([]);
    system.repository().close();
  });
  it('returns MissingFile when attachment bytes are gone', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const source = join(system.directory, 'notes.txt');
    writeFileSync(source, 'notes');
    system.dialogState.file = source;
    await system.handlers.attachmentsAdd({ taskId: 'task-1' });
    const attachment = system.repository().load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('The attachment should have been added');
    const path = system.repository().attachmentPath(attachment.id);
    if (!path) throw new Error('The repository should resolve its attachment');
    unlinkSync(path);

    const result = await system.handlers.attachmentsOpen({
      attachmentId: attachment.id,
    });

    expect(result).toEqual({ ok: false, error: 'MissingFile' });
    expect(system.opened).toEqual([]);
    system.repository().close();
  });

  it('rejects unknown package tokens without modifying the profile', () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const snapshot = system.repository().load();

    const result = system.handlers.backupRestore({
      packageToken: 'unknown-token',
    });

    expect(result).toEqual({ ok: false, error: 'PackageInvalid' });
    expect(system.repository().load()).toEqual(snapshot);
    system.repository().close();
  });

  it('returns corruption problems from backup verification without restoring', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const exportParent = join(system.directory, 'exports');
    mkdirSync(exportParent);
    system.dialogState.folder = exportParent;
    await system.handlers.backupExport({});
    const packagePath = join(exportParent, readdirSync(exportParent)[0] ?? '');
    writeFileSync(join(packagePath, 'data.json'), '{');
    system.dialogState.folder = packagePath;

    const result = await system.handlers.backupVerify({});

    expect(result).toMatchObject({
      ok: false,
      error: 'PackageInvalid',
      problems: [{ path: 'package' }],
    });
    expect(system.repository().load().tasks).toHaveLength(1);
    system.repository().close();
  });

  it('restores only a verified package and reopens the repository', async () => {
    const system = makeSystem();
    addTask(system.repository(), 'task-1', 0);
    const exportParent = join(system.directory, 'exports');
    mkdirSync(exportParent);
    system.dialogState.folder = exportParent;
    expect(await system.handlers.backupExport({})).toEqual({
      ok: true,
      value: null,
    });
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
    expect(verified).toMatchObject({ ok: true });
    if (!verified.ok) throw new Error('The exported package should verify');

    const restored = system.handlers.backupRestore({
      packageToken: verified.value.packageToken,
    });

    expect(restored).toMatchObject({
      ok: true,
      value: { tasks: [{ id: 'task-1', title: 'task-1' }] },
    });
    expect(system.handlers.historyUndo({})).toEqual({
      ok: false,
      error: 'NotUndoable',
    });
    system.repository().close();
  });

  it('reports package corruption and reopens the unchanged profile', async () => {
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
    const profile = system.repository().load();
    writeFileSync(join(system.dialogState.folder, 'data.json'), '{');

    const result = system.handlers.backupRestore({
      packageToken: verified.value.packageToken,
    });

    expect(result).toEqual({ ok: false, error: 'PackageInvalid' });
    expect(system.repository().load()).toEqual(profile);
    system.repository().close();
  });
});
