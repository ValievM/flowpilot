import Database from 'better-sqlite3';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): {
  repository: Repository;
  directory: string;
  path: string;
} {
  const directory = mkdtempSync(
    join(tmpdir(), 'flowpilot-attachment-history-'),
  );
  directories.push(directory);
  const path = join(directory, 'tasks.sqlite');
  return { repository: new Repository(path, clock), directory, path };
}

function basicTask() {
  return {
    id: 'task-1',
    title: 'Task',
    status: { kind: 'todo' as const },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Repository attachment history', () => {
  it('discards added attachment file when its apply transaction fails', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'add-transaction-failure.txt');
    writeFileSync(source, 'attachment');

    const result = repository.apply(
      [
        { kind: 'attachment.add', taskId: 'task-1', sourcePath: source },
        {
          kind: 'task.update',
          id: 'missing-task',
          changes: { title: 'failure' },
        },
      ],
      1,
    );

    expect(result).toMatchObject({ ok: false });
    expect(repository.load()).toMatchObject({
      revision: 1,
      tasks: [{ attachments: [] }],
    });
    expect(readdirSync(join(directory, 'attachments'))).toEqual([]);
    expect(repository.history(10).entries).toHaveLength(1);
    repository.close();
  });
  it('undoes an attachment addition as a new history entry', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'new.txt');
    writeFileSync(source, 'new attachment');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    const entry = repository.history(1).entries[0];
    if (!entry) throw new Error('Expected attachment history entry');

    expect(repository.undo(entry.id)).toEqual({
      ok: true,
      value: { revision: 3 },
    });
    expect(repository.load()).toMatchObject({
      revision: 3,
      tasks: [{ attachments: [] }],
    });
    expect(existsSync(join(directory, 'attachments', attachment.id))).toBe(
      false,
    );
    expect(
      existsSync(join(directory, 'attachments', '.trash', attachment.id)),
    ).toBe(true);
    expect(repository.history(10).entries).toHaveLength(3);
    repository.close();
  });

  it('does not undo attachment addition when moving its file to trash fails', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'new.txt');
    writeFileSync(source, 'new attachment');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    const entry = repository.history(1).entries[0];
    if (!entry) throw new Error('Expected attachment history entry');
    writeFileSync(join(directory, 'attachments', '.trash'), 'not a directory');

    expect(repository.undo(entry.id)).toMatchObject({ ok: false });
    expect(repository.load()).toMatchObject({
      revision: 2,
      tasks: [{ attachments: [{ id: attachment.id }] }],
    });
    expect(existsSync(join(directory, 'attachments', attachment.id))).toBe(
      true,
    );
    expect(repository.history(10).entries).toHaveLength(2);
    repository.close();
  });
  it('does not undo attachment addition when its file is missing', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'missing.txt');
    writeFileSync(source, 'attachment');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    const entry = repository.history(1).entries[0];
    if (!entry) throw new Error('Expected attachment history entry');
    const before = repository.load();
    const historyBefore = repository.history(10);
    rmSync(join(directory, 'attachments', attachment.id));

    expect(repository.undo(entry.id)).toMatchObject({
      ok: false,
      error: { kind: 'NotUndoable' },
    });
    expect(repository.load()).toEqual(before);
    expect(repository.history(10)).toEqual(historyBefore);
    expect(existsSync(join(directory, 'attachments', attachment.id))).toBe(
      false,
    );
    repository.close();
  });

  it('restores attachment file when its removal transaction fails', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'transaction-failure.txt');
    writeFileSync(source, 'attachment');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');

    const result = repository.apply(
      [
        { kind: 'attachment.remove', attachmentId: attachment.id },
        {
          kind: 'task.update',
          id: 'missing-task',
          changes: { title: 'failure' },
        },
      ],
      2,
    );

    expect(result).toMatchObject({ ok: false });
    expect(repository.load()).toMatchObject({
      revision: 2,
      tasks: [{ attachments: [{ id: attachment.id }] }],
    });
    expect(existsSync(join(directory, 'attachments', attachment.id))).toBe(
      true,
    );
    expect(
      existsSync(join(directory, 'attachments', '.trash', attachment.id)),
    ).toBe(false);
    expect(repository.history(10).entries).toHaveLength(2);
    repository.close();
  });

  it('restores added attachment file when its undo transaction fails', () => {
    const { repository, directory, path } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'undo-transaction-failure.txt');
    writeFileSync(source, 'attachment');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    const entry = repository.history(1).entries[0];
    if (!entry) throw new Error('Expected attachment history entry');
    const database = new Database(path);
    database.exec(
      "CREATE TRIGGER fail_undo_history BEFORE INSERT ON change_log WHEN NEW.source = 'undo' BEGIN SELECT RAISE(ABORT, 'undo failure'); END",
    );

    expect(repository.undo(entry.id)).toMatchObject({ ok: false });
    expect(repository.load()).toMatchObject({
      revision: 2,
      tasks: [{ attachments: [{ id: attachment.id }] }],
    });
    expect(existsSync(join(directory, 'attachments', attachment.id))).toBe(
      true,
    );
    expect(
      existsSync(join(directory, 'attachments', '.trash', attachment.id)),
    ).toBe(false);
    expect(repository.history(10).entries).toHaveLength(2);
    database.close();
    repository.close();
  });

  it('keeps attachment metadata and file when moving to trash fails', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'move-failure.txt');
    writeFileSync(source, 'attachment');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    writeFileSync(join(directory, 'attachments', '.trash'), 'not a directory');

    const result = repository.apply(
      [{ kind: 'attachment.remove', attachmentId: attachment.id }],
      2,
    );

    expect(result.ok).toBe(false);
    expect(repository.load()).toMatchObject({
      revision: 2,
      tasks: [{ attachments: [{ id: attachment.id }] }],
    });
    expect(existsSync(join(directory, 'attachments', attachment.id))).toBe(
      true,
    );
    expect(
      existsSync(join(directory, 'attachments', '.trash', attachment.id)),
    ).toBe(false);
    expect(repository.history(10).entries).toHaveLength(2);
    repository.close();
  });
  it('does not undo attachment removal after its trashed file is missing', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'gone.txt');
    writeFileSync(source, 'attachment');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    repository.apply(
      [{ kind: 'attachment.remove', attachmentId: attachment.id }],
      2,
    );
    rmSync(join(directory, 'attachments', '.trash', attachment.id));
    expect(repository.undo()).toEqual({
      ok: false,
      error: { kind: 'NotUndoable', reason: 'файл вложения удалён' },
    });
    expect(repository.load().tasks[0]?.attachments).toEqual([]);
    repository.close();
  });
});
