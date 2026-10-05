import { AiRunner } from './ai/ai-runner';
import { ManualExchangeProvider } from './ai/manual-exchange-provider';
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
import type { IpcMainInvokeEvent } from 'electron';
import { ipcChannels } from '../shared/contracts';
import { createStartupAiRunner } from './ai/startup-ai-runner';

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

  it('rejects task creation with renderer-supplied attachments without changing storage', () => {
    const repository = openRepository();
    const result = applyCommands(
      {
        commands: [
          {
            kind: 'task.create',
            task: {
              id: 'task-ipc',
              title: 'Plan',
              description: '',
              status: { kind: 'todo' as const },
              columnId: 'todo',
              day: '2026-10-05',
              subtasks: [],
              comments: [],
              attachments: [
                {
                  id: 'attachment-ipc',
                  name: 'notes.txt',
                  mediaType: 'text/plain',
                  sizeBytes: 12,
                },
              ],
              addedOrder: 0,
            },
          },
        ],
        expectedRevision: 0,
      },
      { repository },
    );
    expect(result).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(repository.load().revision).toBe(0);
    expect(repository.load().tasks).toEqual([]);
    repository.close();
  });

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
    repository.close();
  });

  it('rejects unapproved setting keys through both IPC channels', () => {
    const repository = openRepository();
    expect(
      setSetting(
        { key: 'theme', value: 'dark', expectedRevision: 0 },
        { repository },
      ),
    ).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(
      applyCommands(
        {
          commands: [{ kind: 'setting.set', key: 'theme', value: 'dark' }],
          expectedRevision: 0,
        },
        { repository },
      ),
    ).toEqual({ ok: false, error: 'ValidationFailed' });
    expect(repository.load().revision).toBe(0);
    expect(Object.hasOwn(repository.load().settings, 'theme')).toBe(false);
    repository.close();
  });

  it('rejects duplicate and out-of-range workdays through both IPC channels', () => {
    const repository = openRepository();
    for (const value of [[], [1, 1], [8]]) {
      expect(
        setSetting(
          { key: 'workdays', value, expectedRevision: 0 },
          { repository },
        ),
      ).toEqual({ ok: false, error: 'ValidationFailed' });
      expect(
        applyCommands(
          {
            commands: [{ kind: 'setting.set', key: 'workdays', value }],
            expectedRevision: 0,
          },
          { repository },
        ),
      ).toEqual({ ok: false, error: 'ValidationFailed' });
    }
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

  it('registers the public IPC channels including AI run and cancellation', () => {
    const channels: string[] = [];
    const repository = openRepository();
    const manualProvider = new ManualExchangeProvider();
    registerIpcHandlers(
      { handle: (channel) => channels.push(channel) },
      {
        repository,
        appInfo: {
          getName: () => 'FlowPilot',
          getVersion: () => '0.1.0',
        },
        aiRunner: new AiRunner(manualProvider),
        manualProvider,
      },
    );
    expect(channels).toEqual([
      'snapshot.load',
      'commands.apply',
      'settings.get',
      'settings.set',
      'app.info',
      'ai.run',
      'ai.cancel',
      'ai.prompt',
      'ai.reply',
    ]);
    repository.close();
  });
  it('returns a scripted test fake reply through startup and ai.run IPC', async () => {
    const repository = openRepository();
    const manualProvider = new ManualExchangeProvider();
    const proposal = {
      id: 'scripted-proposal',
      baseRevision: 1,
      ruleVersions: {},
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'scripted-task',
            title: 'Scripted task',
            columnId: 'todo',
            subtasks: [],
            day: '2026-10-06',
            time: '09:30',
            deadline: '2026-10-09',
          },
        },
        {
          kind: 'task.update',
          id: 'task-1',
          changes: {
            day: '2026-10-07',
            time: '14:45',
            deadline: '2026-10-10',
          },
        },
      ],
      rationale: 'Scripted test reply',
      unknowns: [],
      createdAt: '2026-10-05T12:00:00Z',
    };
    const aiRunner = createStartupAiRunner(
      false,
      {
        FLOWPILOT_TEST: '1',
        FLOWPILOT_TEST_AI_REPLY: JSON.stringify(proposal),
      },
      manualProvider,
    );
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, request: unknown) => unknown
    >();
    registerIpcHandlers(
      {
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
      },
      {
        repository,
        appInfo: {
          getName: () => 'FlowPilot',
          getVersion: () => '0.1.0',
        },
        aiRunner,
        manualProvider,
      },
    );

    // The IPC handler ignores Electron's event, so an empty event is safe here.
    const result = await handlers.get(ipcChannels.aiRun)?.(
      {} as IpcMainInvokeEvent,
      {
        operationId: 'startup-scripted',
        context: { tasks: [{ id: 'task-1' }] },
        instruction: 'Return the scripted proposal',
        responseSchema: { type: 'object' },
      },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        ...proposal,
        commands: [
          {
            kind: 'task.create',
            task: {
              id: 'scripted-task',
              title: 'Scripted task',
              columnId: 'todo',
              subtasks: [],
              day: '2026-10-06',
              time: '09:30:00',
              deadline: '2026-10-09',
            },
          },
          {
            kind: 'task.update',
            id: 'task-1',
            changes: {
              day: '2026-10-07',
              time: '14:45:00',
              deadline: '2026-10-10',
            },
          },
        ],
      },
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    repository.close();
  });
});
