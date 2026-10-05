import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  it('moves an undone attachment addition into trash', () => {
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
    expect(repository.undo(entry.id)).toMatchObject({ ok: true });
    expect(repository.load().tasks[0]?.attachments).toEqual([]);
    expect(
      existsSync(join(directory, 'attachments', '.trash', attachment.id)),
    ).toBe(true);
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
