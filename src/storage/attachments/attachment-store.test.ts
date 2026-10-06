import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../migrate';
import { AttachmentStore } from './attachment-store';

const directories: string[] = [];
let nextId = 0;

function openStorage(maxSizeBytes?: number) {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-attachments-'));
  directories.push(directory);
  const databasePath = join(directory, 'tasks.sqlite');
  const database = new Database(databasePath);
  migrate(database, databasePath);
  database
    .prepare(
      "INSERT INTO tasks(id,title,column_id,status_kind,position,version,created_at,updated_at) VALUES ('task-1','Task','todo','todo',0,1,'now','now')",
    )
    .run();
  const options = {
    ...(maxSizeBytes === undefined ? {} : { maxSizeBytes }),
    makeId: () => `attachment-${String(++nextId)}`,
  };
  const store = new AttachmentStore(
    database,
    directory,
    {
      now: () => Temporal.Instant.from('2026-10-05T12:00:00Z'),
    },
    options,
  );
  return { database, directory, store };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('AttachmentStore', () => {
  it('copies an attachment and persists its size, type and sha256 without changing the source', () => {
    const { database, directory, store } = openStorage();
    const source = join(directory, 'notes.txt');
    writeFileSync(source, 'notes');
    const result = store.add('task-1', source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const path = store.getPath(result.value.id);
    expect(path).toBe(join(directory, 'attachments', result.value.id));
    expect(readFileSync(path as string, 'utf8')).toBe('notes');
    expect(readFileSync(source, 'utf8')).toBe('notes');
    expect(result.value).toMatchObject({
      name: 'notes.txt',
      mediaType: 'text/plain',
      sizeBytes: 5,
    });
    const row = database
      .prepare('SELECT sha256, created_at FROM attachments WHERE id = ?')
      .get(result.value.id) as { sha256: string; created_at: string };
    expect(row).toEqual({
      sha256: createHash('sha256').update('notes').digest('hex'),
      created_at: '2026-10-05T12:00:00Z',
    });
  });

  it('returns FileNotFound and leaves the database unchanged for a missing source', () => {
    const { database, directory, store } = openStorage();
    expect(store.add('task-1', join(directory, 'missing'))).toEqual({
      ok: false,
      error: { kind: 'FileNotFound' },
    });
    expect(
      database.prepare('SELECT count(*) AS count FROM attachments').get(),
    ).toEqual({ count: 0 });
  });

  it('rejects files over a configurable limit without leaving a copy', () => {
    const { database, directory, store } = openStorage(2);
    const source = join(directory, 'large.txt');
    writeFileSync(source, 'large');
    expect(store.add('task-1', source)).toEqual({
      ok: false,
      error: { kind: 'TooLarge', limitBytes: 2 },
    });
    expect(readdirSync(directory)).not.toContain('attachments');
    expect(
      database.prepare('SELECT count(*) AS count FROM attachments').get(),
    ).toEqual({ count: 0 });
  });

  it('removes control characters from the displayed name and keeps the copy contained', () => {
    const { directory, store } = openStorage();
    const sourceDirectory = join(directory, 'nested');
    mkdirSync(sourceDirectory);
    const source = join(sourceDirectory, 'passwd\n\u0085.txt');
    writeFileSync(source, 'secret');
    const result = store.add('task-1', source);
    expect(result.ok && result.value.name).toBe('passwd.txt');
    expect(result.ok && store.getPath(result.value.id)).toContain(
      join(directory, 'attachments'),
    );
  });

  it('rejects a directory instead of copying it', () => {
    const { directory, store } = openStorage();
    const source = join(directory, 'folder');
    mkdirSync(source);
    expect(store.add('task-1', source)).toEqual({
      ok: false,
      error: { kind: 'NotAFile' },
    });
  });

  it('reports Missing and checksum mismatch when a stored file is removed or changed', () => {
    const { directory, store } = openStorage();
    const source = join(directory, 'data.txt');
    writeFileSync(source, 'before');
    const added = store.add('task-1', source);
    if (!added.ok) throw new Error('Expected attachment to be added');
    const path = store.getPath(added.value.id) as string;
    expect(store.verify(added.value.id)).toEqual({ kind: 'Valid' });
    writeFileSync(path, 'after!');
    expect(store.verify(added.value.id)).toEqual({ kind: 'ChecksumMismatch' });
    rmSync(path);
    expect(store.verify(added.value.id)).toEqual({ kind: 'Missing' });
  });

  it('keeps trash files during orphan collection', () => {
    const { database, directory, store } = openStorage();
    const source = join(directory, 'trash.txt');
    writeFileSync(source, 'trash');
    const placed = store.prepare('task-1', source);
    if (!placed.ok) throw new Error('Expected attachment to be prepared');
    expect(store.moveToTrash(placed.value.id)).toBe(true);
    expect(
      database.prepare('SELECT count(*) AS count FROM attachments').get(),
    ).toEqual({ count: 0 });
    const trashed = join(directory, 'attachments', '.trash', placed.value.id);
    expect(existsSync(trashed)).toBe(true);
    expect(store.gc()).toBe(0);
    expect(existsSync(trashed)).toBe(true);
  });

  it('leaves no record or temporary file when copying fails', () => {
    const { database, directory, store } = openStorage();
    const source = join(directory, 'copy.txt');
    writeFileSync(source, 'copy');
    writeFileSync(join(directory, 'attachments'), 'not a directory');
    expect(store.add('task-1', source)).toEqual({
      ok: false,
      error: { kind: 'CopyFailed' },
    });
    expect(
      database.prepare('SELECT count(*) AS count FROM attachments').get(),
    ).toEqual({ count: 0 });
  });

  it('uses separate generated paths for attachments with the same source name', () => {
    const { directory, store } = openStorage();
    const firstDirectory = join(directory, 'first');
    const secondDirectory = join(directory, 'second');
    mkdirSync(firstDirectory);
    mkdirSync(secondDirectory);
    const first = join(firstDirectory, 'same.txt');
    const second = join(secondDirectory, 'same.txt');
    writeFileSync(first, 'one');
    writeFileSync(second, 'two');
    const firstAdded = store.add('task-1', first);
    const secondAdded = store.add('task-1', second);
    expect(firstAdded.ok && secondAdded.ok).toBe(true);
    if (!firstAdded.ok || !secondAdded.ok) return;
    expect(store.getPath(firstAdded.value.id)).not.toBe(
      store.getPath(secondAdded.value.id),
    );
    expect(
      readFileSync(store.getPath(firstAdded.value.id) as string, 'utf8'),
    ).toBe('one');
    expect(
      readFileSync(store.getPath(secondAdded.value.id) as string, 'utf8'),
    ).toBe('two');
  });

  it('garbage-collects only regular files without database records', () => {
    const { directory, store } = openStorage();
    const source = join(directory, 'keep.txt');
    writeFileSync(source, 'keep');
    const added = store.add('task-1', source);
    if (!added.ok) throw new Error('Expected attachment to be added');
    writeFileSync(join(directory, 'attachments', 'orphan'), 'orphan');
    expect(store.gc()).toBe(1);
    expect(readdirSync(join(directory, 'attachments'))).toEqual([
      added.value.id,
    ]);
  });
});
