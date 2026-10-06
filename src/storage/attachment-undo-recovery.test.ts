import {
  existsSync,
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
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-attachment-undo-'));
  directories.push(directory);
  const path = join(directory, 'tasks.sqlite');
  return { repository: new Repository(path, clock), directory, path };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('attachment removal undo recovery', () => {
  it('recovers an interrupted attachment-removal undo after restart', () => {
    const { repository, directory, path } = openRepository();
    repository.apply(
      [
        {
          kind: 'task.create',
          task: {
            id: 'task-1',
            title: 'Task',
            status: { kind: 'todo' },
            columnId: 'todo',
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 1,
          },
        },
      ],
      0,
    );
    const source = join(directory, 'undo-crash.txt');
    writeFileSync(source, 'attachment survives undo crash');
    repository.apply(
      [{ kind: 'attachment.add', taskId: 'task-1', sourcePath: source }],
      1,
    );
    const attachment = repository.load().tasks[0]?.attachments[0];
    if (!attachment) throw new Error('Expected attachment');
    const stored = join(directory, 'attachments', attachment.id);
    const trashed = join(directory, 'attachments', '.trash', attachment.id);
    repository.apply(
      [{ kind: 'attachment.remove', attachmentId: attachment.id }],
      2,
    );

    renameSync(trashed, stored);
    repository.close();

    const restarted = new Repository(path, clock);

    expect(restarted.load()).toMatchObject({
      revision: 3,
      tasks: [{ attachments: [] }],
    });
    expect(existsSync(stored)).toBe(false);
    expect(existsSync(trashed)).toBe(true);
    expect(readFileSync(trashed, 'utf8')).toBe(
      'attachment survives undo crash',
    );
    restarted.close();
  });
});
