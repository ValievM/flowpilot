import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './index';
import type { StorageCommand } from './types';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T12:00:00Z') };

function openRepository(): { repository: Repository; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ai-apply-'));
  directories.push(directory);
  const path = join(directory, 'tasks.sqlite');
  return { repository: new Repository(path, clock), path };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('AI application storage', () => {
  it('defaults the stored AI mode to auto', () => {
    const { repository } = openRepository();
    expect(repository.load().settings.aiMode).toBe('auto');
  });

  it('stores a confirmation mode change as a setting', () => {
    const { repository, path } = openRepository();
    const result = repository.apply(
      [{ kind: 'setting.set', key: 'aiMode', value: 'confirm' }],
      0,
    );
    expect(result).toMatchObject({ ok: true, value: { revision: 1 } });
    repository.close();
    const reopened = new Repository(path, clock);
    expect(reopened.load().settings.aiMode).toBe('confirm');
  });

  it('persists an AI rank through task creation and a rank command', () => {
    const { repository, path } = openRepository();
    const task = {
      id: 'task-1',
      title: 'Prepare notes',
      status: { kind: 'todo' as const },
      columnId: 'todo',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 1,
    };
    const created = repository.apply([{ kind: 'task.create', task }], 0);
    expect(created.ok).toBe(true);
    const ranked = repository.apply(
      [
        {
          kind: 'task.setAiRank',
          taskId: 'task-1',
          rank: 2,
        } as unknown as StorageCommand,
      ],
      1,
      { source: 'ai' },
    );
    expect(ranked).toMatchObject({ ok: true, value: { revision: 2 } });
    repository.close();
    const reopened = new Repository(path, clock);
    expect(reopened.load().tasks[0]?.aiRank).toBe(2);
    expect(reopened.history(10).entries[0]?.source).toBe('ai');
  });
});
