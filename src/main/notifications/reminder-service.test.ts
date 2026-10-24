import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Repository } from '../../storage';
import {
  requestNotificationPermission,
  runReminderTick,
  type NotificationAdapter,
  type ReminderDeps,
} from './reminder-service';

const directories: string[] = [];
const zone = 'Europe/Moscow';
let nowText = '2026-10-05T11:55:00Z'; // 14:55 in Moscow

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  nowText = '2026-10-05T11:55:00Z';
});

function open(path?: string) {
  const directory = path
    ? undefined
    : mkdtempSync(join(tmpdir(), 'flowpilot-rem-'));
  if (directory) directories.push(directory);
  const file = path ?? join(directory ?? '', 'tasks.sqlite');
  const clock = { now: () => Temporal.Instant.from(nowText) };
  return { repository: new Repository(file, clock), file, clock };
}

function adapter(result: 'shown' | 'failed' = 'shown') {
  const clicks: (() => void)[] = [];
  const show = vi.fn(
    (input: { title: string; body: string; onClick: () => void }) => {
      clicks.push(input.onClick);
      return Promise.resolve(result);
    },
  );
  return { adapter: { show } satisfies NotificationAdapter, show, clicks };
}

function deps(
  repository: Repository,
  notifier: NotificationAdapter,
  openTarget = vi.fn(),
): ReminderDeps {
  return {
    repository,
    adapter: notifier,
    clock: { now: () => Temporal.Instant.from(nowText) },
    timeZone: zone,
    openTarget,
  };
}

function setup(settings: {
  enabled: boolean;
  permission: 'unknown' | 'granted' | 'denied';
}) {
  const { repository, file } = open();
  const task = {
    kind: 'task.create' as const,
    task: {
      id: 'task-1',
      title: 'Созвон с научруком',
      status: { kind: 'todo' as const },
      columnId: 'todo',
      day: '2026-10-05',
      time: '15:00',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 1,
    },
  };
  const applied = repository.apply(
    [
      task as never,
      { kind: 'setting.set', key: 'remindersEnabled', value: settings.enabled },
      { kind: 'setting.set', key: 'reminderLeadMinutes', value: 10 },
      {
        kind: 'setting.set',
        key: 'notificationPermission',
        value: settings.permission,
      },
    ],
    0,
  );
  expect(applied.ok).toBe(true);
  return { repository, file };
}

describe('reminder service', () => {
  it('shows a due reminder exactly once, even if it is checked again', () => {
    const { repository } = setup({ enabled: true, permission: 'granted' });
    const { adapter: notifier, show } = adapter();

    expect(runReminderTick(deps(repository, notifier))).toBe(1);
    expect(runReminderTick(deps(repository, notifier))).toBe(0);

    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0]?.[0].title).toBe('Созвон с научруком');
  });

  it('does not repeat after a restart, because the ledger is stored', () => {
    const first = setup({ enabled: true, permission: 'granted' });
    const { adapter: notifier, show } = adapter();
    runReminderTick(deps(first.repository, notifier));
    first.repository.close();

    const second = open(first.file);
    runReminderTick(deps(second.repository, notifier));

    expect(show).toHaveBeenCalledTimes(1);
  });

  it('shows nothing and asks for nothing when the permission was never granted', () => {
    const { repository } = setup({ enabled: true, permission: 'unknown' });
    const { adapter: notifier, show } = adapter();
    expect(runReminderTick(deps(repository, notifier))).toBe(0);
    expect(show).not.toHaveBeenCalled();
  });

  it('shows nothing when reminders are switched off, and nothing when macOS said no', () => {
    const off = setup({ enabled: false, permission: 'granted' });
    const denied = setup({ enabled: true, permission: 'denied' });
    const { adapter: notifier, show } = adapter();
    runReminderTick(deps(off.repository, notifier));
    runReminderTick(deps(denied.repository, notifier));
    expect(show).not.toHaveBeenCalled();
    expect(denied.repository.load().tasks).toHaveLength(1);
  });

  it('opens the task when its notification is clicked', () => {
    const { repository } = setup({ enabled: true, permission: 'granted' });
    const { adapter: notifier, clicks } = adapter();
    const openTarget = vi.fn();
    runReminderTick(deps(repository, notifier, openTarget));
    clicks[0]?.();
    expect(openTarget).toHaveBeenCalledWith({ kind: 'task', id: 'task-1' });
  });

  it('records what macOS answered only when the person asks, and asks only then', async () => {
    const { repository } = setup({ enabled: true, permission: 'unknown' });
    const granted = adapter('shown');
    expect(
      await requestNotificationPermission(deps(repository, granted.adapter)),
    ).toBe('granted');
    expect(repository.load().settings.notificationPermission).toBe('granted');

    const refused = adapter('failed');
    expect(
      await requestNotificationPermission(deps(repository, refused.adapter)),
    ).toBe('denied');
    expect(repository.load().settings.notificationPermission).toBe('denied');
  });

  it('forgets announced keys older than a day but keeps the risk state', () => {
    const { repository } = setup({ enabled: true, permission: 'granted' });
    repository.reminders.writeLedger({
      sent: ['task:old:2026-10-01', 'repeat:old:2026-10-02', 'risk:task-9'],
      risks: { 'task-9': 'tight' },
    });
    const { adapter: notifier } = adapter();
    runReminderTick(deps(repository, notifier));
    const ledger = repository.reminders.readLedger();
    expect(ledger.sent).not.toContain('task:old:2026-10-01');
    expect(ledger.sent).not.toContain('repeat:old:2026-10-02');
    expect(ledger.risks['task-9']).toBe('tight');
  });
});
