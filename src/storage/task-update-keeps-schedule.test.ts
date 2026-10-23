import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './index';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-05T12:00:00Z') };

function openRepository(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-schedule-'));
  directories.push(directory);
  return new Repository(join(directory, 'tasks.sqlite'), clock);
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const scheduled = {
  id: 'task-1',
  title: 'Task',
  status: { kind: 'todo' as const },
  columnId: 'todo',
  day: Temporal.PlainDate.from('2026-10-05'),
  time: Temporal.PlainTime.from('09:30'),
  deadline: Temporal.PlainDate.from('2026-10-09'),
  rolledOverFrom: Temporal.PlainDate.from('2026-10-02'),
  estimate: { unit: 'workdays' as const, value: 3 },
  subtasks: [],
  comments: [],
  attachments: [],
  addedOrder: 1,
};

function createScheduledTask(): Repository {
  const repository = openRepository();
  repository.apply([{ kind: 'task.create', task: scheduled }], 0);
  return repository;
}

describe('task.update keeps fields it does not mention', () => {
  it.each([
    ['description', { description: 'Подробности' }],
    ['title', { title: 'Новое название' }],
    ['status', { status: { kind: 'todo' as const } }],
  ])('keeps the whole schedule when only %s changes', (_name, changes) => {
    const repository = createScheduledTask();
    const result = repository.apply(
      [{ kind: 'task.update', id: scheduled.id, changes }],
      1,
    );

    expect(result.ok).toBe(true);
    const task = repository.load().tasks[0];
    expect(task?.day?.toString()).toBe('2026-10-05');
    expect(task?.time?.toString()).toBe('09:30:00');
    expect(task?.deadline?.toString()).toBe('2026-10-09');
    expect(task?.rolledOverFrom?.toString()).toBe('2026-10-02');
    expect(task?.estimate).toEqual({ unit: 'workdays', value: 3 });
    repository.close();
  });

  it('clears only the deadline when it is explicitly set to null', () => {
    const repository = createScheduledTask();
    repository.apply(
      [{ kind: 'task.update', id: scheduled.id, changes: { deadline: null } }],
      1,
    );

    const task = repository.load().tasks[0];
    expect(task).not.toHaveProperty('deadline');
    expect(task?.day?.toString()).toBe('2026-10-05');
    expect(task?.time?.toString()).toBe('09:30:00');
    repository.close();
  });

  it('replaces only the day when a new day is given', () => {
    const repository = createScheduledTask();
    repository.apply(
      [
        {
          kind: 'task.update',
          id: scheduled.id,
          changes: { day: Temporal.PlainDate.from('2026-10-07') },
        },
      ],
      1,
    );

    const task = repository.load().tasks[0];
    expect(task?.day?.toString()).toBe('2026-10-07');
    expect(task?.time?.toString()).toBe('09:30:00');
    expect(task?.deadline?.toString()).toBe('2026-10-09');
    repository.close();
  });
});
