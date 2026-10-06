import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../storage';
import { applyCommands } from './handlers';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ipc-attachments-'));
  directories.push(directory);
  return new Repository(join(directory, 'flowpilot.db'), clock);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('IPC attachment handlers', () => {
  it('rejects attachment additions through IPC without changing storage', () => {
    const repository = openRepository();
    const task = {
      id: 'task-ipc',
      title: 'Plan',
      description: '',
      status: { kind: 'todo' as const },
      columnId: 'todo',
      day: '2026-10-05',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    };
    expect(
      applyCommands(
        { commands: [{ kind: 'task.create', task }], expectedRevision: 0 },
        { repository },
      ),
    ).toMatchObject({ ok: true, value: { revision: 1 } });
    const result = applyCommands(
      {
        commands: [
          {
            kind: 'attachment.add',
            taskId: 'task-ipc',
            attachment: {
              id: 'attachment-ipc',
              name: 'notes.txt',
              mediaType: 'text/plain',
              sizeBytes: 12,
            },
          },
        ],
        expectedRevision: 1,
      },
      { repository },
    );
    expect(result).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(repository.load().revision).toBe(1);
    expect(repository.load().tasks).toMatchObject([
      { id: 'task-ipc', attachments: [] },
    ]);
    const sourceDirectory = mkdtempSync(
      join(tmpdir(), 'flowpilot-ipc-source-'),
    );
    directories.push(sourceDirectory);
    const sourcePath = join(sourceDirectory, 'source.txt');
    writeFileSync(sourcePath, 'notes');
    expect(
      applyCommands(
        {
          commands: [
            {
              kind: 'attachment.add',
              taskId: 'task-ipc',
              sourcePath,
            },
          ],
          expectedRevision: 1,
        },
        { repository },
      ),
    ).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(repository.load().revision).toBe(1);
    repository.close();
  });
});
