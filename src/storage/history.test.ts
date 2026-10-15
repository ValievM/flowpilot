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
import type { HistoryEntry } from './types';
import { Repository } from './repository';
import { AttachmentStore } from './attachments/attachment-store';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): {
  repository: Repository;
  path: string;
  directory: string;
} {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-history-'));
  directories.push(directory);
  const path = join(directory, 'tasks.sqlite');
  return { repository: new Repository(path, clock), path, directory };
}

function task(id: string, title: string) {
  return {
    id,
    title,
    status: { kind: 'todo' as const },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 1,
  };
}
function historyEntry(repository: Repository): HistoryEntry {
  const entry = repository.history(1).entries[0];
  if (!entry) throw new Error('Expected history entry');
  return entry;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Repository history and undo', () => {
  it('records a task creation and undoes it as a new persistent entry', () => {
    const { repository, path } = openRepository();
    expect(
      repository.apply(
        [{ kind: 'task.create', task: task('task-1', 'Write') }],
        0,
      ),
    ).toEqual({ ok: true, value: { revision: 1 } });
    expect(repository.undo()).toEqual({ ok: true, value: { revision: 2 } });
    expect(repository.load().tasks).toEqual([]);
    expect(repository.history(10).entries.map(({ source }) => source)).toEqual([
      'undo',
      'user',
    ]);
    repository.close();
    const reopened = new Repository(path, clock);
    expect(reopened.history(10).entries).toHaveLength(2);
    reopened.close();
  });
  it('repeated undo without an id undoes the newest remaining change then reports empty history', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-a', 'A') }], 0);
    repository.apply([{ kind: 'task.create', task: task('task-b', 'B') }], 1);

    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks.map(({ id }) => id)).toEqual(['task-a']);
    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks).toEqual([]);
    const historyBeforeFinalUndo = repository.history(10).entries;

    expect(repository.undo()).toEqual({
      ok: false,
      error: { kind: 'NotUndoable' },
    });
    expect(repository.load().tasks).toEqual([]);
    expect(repository.history(10).entries).toEqual(historyBeforeFinalUndo);
    repository.close();
  });
  it('skips an undone change when selecting the newest change without an id', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-a', 'A') }], 0);
    repository.apply([{ kind: 'task.create', task: task('task-b', 'B') }], 1);
    expect(repository.undo()).toMatchObject({ ok: true });
    repository.apply([{ kind: 'task.create', task: task('task-c', 'C') }], 3);

    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks.map(({ id }) => id)).toEqual(['task-a']);
    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks).toEqual([]);
    repository.close();
  });
  it('returns NotFound for an empty undo entry id without undoing latest', () => {
    const { repository } = openRepository();
    repository.apply(
      [{ kind: 'task.create', task: task('task-1', 'Write') }],
      0,
    );
    const history = repository.history(10).entries;

    expect(repository.undo('')).toEqual({
      ok: false,
      error: { kind: 'NotFound' },
    });
    expect(repository.load()).toMatchObject({
      revision: 1,
      tasks: [{ id: 'task-1', title: 'Write' }],
    });
    expect(repository.history(10).entries).toEqual(history);
    repository.close();
  });
  it('records AI-sourced changes and undoes them like user changes', () => {
    const { repository } = openRepository();
    repository.apply(
      [{ kind: 'task.create', task: task('task-1', 'Before') }],
      0,
      { source: 'ai' },
    );
    expect(historyEntry(repository).source).toBe('ai');
    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks).toEqual([]);
    expect(repository.history(10).entries.map(({ source }) => source)).toEqual([
      'undo',
      'ai',
    ]);
    repository.close();
  });

  it('rejects an earlier edit while a later edit changed that task, then allows it after undoing the later edit', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-1', 'A') }], 0);
    const first = historyEntry(repository);
    repository.apply(
      [{ kind: 'task.update', id: 'task-1', changes: { title: 'B' } }],
      1,
    );
    expect(repository.undo(first.id)).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(repository.load().tasks[0]?.title).toBe('B');
    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.undo(first.id)).toMatchObject({ ok: true });
    repository.close();
  });

  it('leaves changes to a different task intact when undoing an older entry', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-a', 'A') }], 0);
    const entry = historyEntry(repository);
    repository.apply([{ kind: 'task.create', task: task('task-b', 'B') }], 1);
    expect(repository.undo(entry.id)).toMatchObject({ ok: true });
    expect(repository.load().tasks.map(({ id }) => id)).toEqual(['task-b']);
    repository.close();
  });

  it('records a batch as one undoable entry and rejects repeat undo and undo of undo', () => {
    const { repository } = openRepository();
    const result = repository.apply(
      [
        {
          kind: 'column.create',
          column: {
            id: 'custom',
            name: 'Custom',
            description: '',
            state: 'todo',
            builtIn: false,
          },
        },
        { kind: 'setting.set', key: 'workdays', value: [1, 2, 3] },
        {
          kind: 'task.create',
          task: { ...task('task-1', 'A'), columnId: 'custom' },
        },
      ],
      0,
    );
    expect(result.ok).toBe(true);
    const entry = historyEntry(repository);
    expect(entry.entities).toHaveLength(3);
    expect(repository.undo(entry.id)).toMatchObject({ ok: true });
    expect(repository.undo(entry.id)).toEqual({
      ok: false,
      error: { kind: 'AlreadyUndone' },
    });
    const undo = historyEntry(repository);
    expect(repository.undo(undo.id)).toEqual({
      ok: false,
      error: { kind: 'NotUndoable' },
    });
    expect(repository.load().columns.map(({ id }) => id)).not.toContain(
      'custom',
    );
    repository.close();
  });

  it('does not add history on a stale revision', () => {
    const { repository } = openRepository();
    expect(
      repository.apply([{ kind: 'task.create', task: task('task-1', 'A') }], 2)
        .ok,
    ).toBe(false);
    expect(repository.history(10).entries).toEqual([]);
    repository.close();
  });

  it('adds attachment history atomically and restores removed files from trash', () => {
    const { repository, directory, path } = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-1', 'A') }], 0);
    const source = join(directory, 'source.txt');
    writeFileSync(source, 'attachment');
    const added = repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    expect(added).toEqual({ ok: true, value: { revision: 2 } });
    expect(historyEntry(repository).revision).toBe(2);
    const taskAttachments = repository.load().tasks[0]?.attachments;
    if (!taskAttachments?.[0]) throw new Error('Expected attachment');
    const attachment = taskAttachments[0];
    const stored = join(directory, 'attachments', attachment.id);
    expect(existsSync(stored)).toBe(true);
    expect(
      repository.apply(
        [{ kind: 'attachment.remove', attachmentId: attachment.id }],
        2,
      ),
    ).toMatchObject({ ok: true });
    expect(
      existsSync(join(directory, 'attachments', '.trash', attachment.id)),
    ).toBe(true);
    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks[0]?.attachments).toContainEqual(attachment);
    expect(existsSync(stored)).toBe(true);
    repository.close();
    const database = new Database(path);
    const store = new AttachmentStore(database, directory, clock);
    expect(store.verify(attachment.id)).toEqual({ kind: 'Valid' });
    database.close();
  });

  it('discards a prepared attachment file when its expected revision is stale', () => {
    const { repository, directory } = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-1', 'A') }], 0);
    const source = join(directory, 'source.txt');
    writeFileSync(source, 'attachment');
    expect(
      repository.apply(
        [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
        0,
      ).ok,
    ).toBe(false);
    expect(readdirSync(join(directory, 'attachments'))).toEqual([]);
    expect(repository.history(10).entries).toHaveLength(1);
    repository.close();
  });
  it('restores a deleted column and its cards to their original positions', () => {
    const { repository } = openRepository();
    repository.apply(
      [
        {
          kind: 'column.create',
          column: {
            id: 'custom',
            name: 'Custom',
            description: '',
            state: 'todo',
            builtIn: false,
          },
        },
      ],
      0,
    );
    repository.apply(
      [
        {
          kind: 'task.create',
          task: { ...task('task-1', 'A'), columnId: 'custom' },
        },
      ],
      1,
    );
    repository.apply(
      [{ kind: 'column.delete', id: 'custom', targetColumnId: 'doing' }],
      2,
    );
    const deletion = historyEntry(repository);
    expect(repository.load().tasks[0]?.columnId).toBe('doing');
    expect(repository.undo(deletion.id)).toMatchObject({ ok: true });
    expect(repository.load().columns.map(({ id }) => id)).toContain('custom');
    expect(repository.load().tasks[0]?.columnId).toBe('custom');
    repository.close();
  });

  it('undoes a task move and rejects a partially invalid batch without history', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'task.create', task: task('task-1', 'A') }], 0);
    repository.apply(
      [{ kind: 'task.move', id: 'task-1', columnId: 'doing' }],
      1,
    );
    expect(repository.undo()).toMatchObject({ ok: true });
    expect(repository.load().tasks[0]?.columnId).toBe('todo');
    const count = repository.history(10).entries.length;
    expect(
      repository.apply(
        [
          { kind: 'setting.set', key: 'theme', value: 'dark' },
          { kind: 'task.move', id: 'missing', columnId: 'doing' },
        ],
        3,
      ).ok,
    ).toBe(false);
    expect(repository.history(10).entries).toHaveLength(count);
    repository.close();
  });
});
