import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../storage';
import {
  applyCommands,
  getAppInfo,
  getSettings,
  loadSnapshot,
  setSetting,
} from './handlers';
import { registerIpcHandlers } from './ipc-handlers';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ipc-'));
  directories.push(directory);
  return new Repository(join(directory, 'flowpilot.db'), clock);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('IPC handlers', () => {
  it('applies a valid command and returns the updated snapshot', () => {
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
    const result = applyCommands(
      { commands: [{ kind: 'task.create', task }], expectedRevision: 0 },
      { repository },
    );
    expect(result).toMatchObject({
      ok: true,
      value: { revision: 1, tasks: [task] },
    });
    repository.close();
  });

  it('rejects malformed requests without changing the repository', () => {
    const repository = openRepository();
    expect(
      applyCommands(
        { commands: 'invalid', expectedRevision: 0 },
        { repository },
      ),
    ).toEqual({
      ok: false,
      error: 'ValidationFailed',
    });
    repository.close();
  });

  it('returns stale revision as a result code instead of throwing', () => {
    const repository = openRepository();
    expect(
      applyCommands({ commands: [], expectedRevision: 1 }, { repository }),
    ).toEqual({
      ok: false,
      error: 'StaleRevision',
    });
    repository.close();
  });

  it('rejects unexpected command fields without touching storage', () => {
    const repository = openRepository();
    expect(
      applyCommands(
        {
          commands: [
            {
              kind: 'setting.set',
              key: 'workdays',
              value: [1, 2, 3, 4, 5],
              path: '/tmp/x',
            },
          ],
          expectedRevision: 0,
        },
        { repository },
      ),
    ).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(
      applyCommands(
        { commands: [], expectedRevision: 0, path: '/tmp/x' },
        { repository },
      ),
    ).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(repository.load().revision).toBe(0);
    repository.close();
  });

  it('rejects an empty workdays setting', () => {
    const repository = openRepository();
    expect(
      setSetting(
        { key: 'workdays', value: [], expectedRevision: 0 },
        { repository },
      ),
    ).toEqual({
      ok: false,
      error: 'ValidationFailed',
    });
    expect(repository.load().revision).toBe(0);
    repository.close();
  });

  it('exposes settings and app information through validated results', () => {
    const repository = openRepository();
    expect(getSettings({}, { repository }).ok).toBe(true);
    expect(
      getAppInfo({}, { getName: () => 'FlowPilot', getVersion: () => '0.1.0' }),
    ).toEqual({
      ok: true,
      value: { name: 'FlowPilot', version: '0.1.0' },
    });
    expect(
      getAppInfo(
        {},
        {
          getName: () => {
            throw new Error('runtime failure');
          },
          getVersion: () => '0.1.0',
        },
      ),
    ).toEqual({ ok: false, error: 'InternalError' });
    expect(loadSnapshot({ path: 'denied' }, { repository })).toEqual({
      ok: false,
      error: 'ValidationFailed',
    });
    repository.close();
  });

  it('registers only the five public channels', () => {
    const channels: string[] = [];
    const repository = openRepository();
    registerIpcHandlers(
      { handle: (channel) => channels.push(channel) },
      {
        repository,
        appInfo: {
          getName: () => 'FlowPilot',
          getVersion: () => '0.1.0',
        },
      },
    );
    expect(channels).toEqual([
      'snapshot.load',
      'commands.apply',
      'settings.get',
      'settings.set',
      'app.info',
    ]);
    repository.close();
  });
});
