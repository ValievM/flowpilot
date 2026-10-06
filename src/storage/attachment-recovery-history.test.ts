import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
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
    join(tmpdir(), 'flowpilot-attachment-recovery-'),
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

describe('Repository attachment recovery history', () => {
  it('recovers an attachment moved to trash before a process crash', () => {
    const { repository, directory, path } = openRepository();
    repository.apply([{ kind: 'task.create', task: basicTask() }], 0);
    const source = join(directory, 'crash-recovery.txt');
    writeFileSync(source, 'attachment survives restart');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    const stored = join(directory, 'attachments', attachment.id);
    const trashed = join(directory, 'attachments', '.trash', attachment.id);
    mkdirSync(join(directory, 'attachments', '.trash'), { recursive: true });

    renameSync(stored, trashed);
    repository.close();

    const restarted = new Repository(path, clock);

    expect(restarted.load()).toMatchObject({
      revision: 2,
      tasks: [{ attachments: [{ id: attachment.id }] }],
    });
    expect(existsSync(stored)).toBe(true);
    expect(readFileSync(stored, 'utf8')).toBe('attachment survives restart');
    expect(existsSync(trashed)).toBe(false);
    restarted.close();
  });
});
