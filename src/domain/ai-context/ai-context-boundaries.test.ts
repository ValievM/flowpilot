import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import type { Task } from '../task';
import { buildContext, contextFingerprint } from './build-context';
import type { ContextInput } from './context-types';

const today = Temporal.PlainDate.from('2026-10-05');
const now = Temporal.ZonedDateTime.from(
  '2026-10-05T09:00-07:00[America/Los_Angeles]',
);

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Задача ${id}`,
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: Number(id.replace(/\D/g, '')) || 0,
    ...overrides,
  };
}

function input(overrides: Partial<ContextInput> = {}): ContextInput {
  return {
    today,
    now,
    tasks: [],
    series: [],
    outcomes: [],
    activeRules: [],
    taskTypes: [],
    disciplines: [],
    workdays: new Set([1, 2, 3, 4, 5]),
    ...overrides,
  };
}

describe('AI context boundary regressions', () => {
  it('redacts absolute URL query paths and spaced relative paths in context', () => {
    const result = buildContext(
      input({
        tasks: [
          task('query', {
            title: 'https://example.com/?path=/Users/Ada/private',
            description: 'next=config/secret',
            comments: [
              {
                id: 'relative',
                text: 'My Documents/secret report then continue',
              },
            ],
          }),
        ],
      }),
    );

    expect(result.tasks[0]?.untrusted.title).toBe(
      'https://example.com/?path=[путь скрыт]',
    );
    expect(result.tasks[0]?.untrusted.description).toBe('next=config/secret');
    expect(result.tasks[0]?.untrusted.comments[0]).toBe(
      '[путь скрыт] then continue',
    );
  });

  it('preserves common input/output prose in untrusted context', () => {
    const title = 'Send the input/output payload without changes';
    const result = buildContext(input({ tasks: [task('prose', { title })] }));
    expect(result.tasks[0]?.untrusted.title).toBe(title);
  });

  it('ranks availability before risk before the task cap', () => {
    const future = Array.from({ length: 100 }, (_, index) =>
      task(`future-${String(index).padStart(3, '0')}`, {
        day: Temporal.PlainDate.from('2026-10-07'),
        deadline: Temporal.PlainDate.from('2026-10-01'),
      }),
    );
    const result = buildContext({
      ...input(),
      tasks: [...future, task('available', { day: today })],
    });

    expect(result.tasks).toHaveLength(100);
    expect(result.tasks.some(({ id }) => id === 'available')).toBe(true);
  });
  it('does not mark a rolled-over task available before its scheduled start', () => {
    const scheduledTime = Temporal.PlainTime.from('14:00');
    const rolledOver = task('rolled-over', {
      day: today,
      time: scheduledTime,
      rolledOverFrom: today.subtract({ days: 1 }),
    });

    const beforeStart = buildContext(input({ tasks: [rolledOver] }));
    const atStart = buildContext(
      input({
        now: now.add({ hours: 5 }),
        tasks: [rolledOver],
      }),
    );
    const afterStart = buildContext(
      input({
        now: now.add({ hours: 6 }),
        tasks: [rolledOver],
      }),
    );

    expect(beforeStart.tasks[0]?.availability).toBe('today');
    expect(atStart.tasks[0]?.availability).toBe('rolled-over');
    expect(afterStart.tasks[0]?.availability).toBe('rolled-over');
  });

  it('keeps overdue tasks ahead of ordinary low-priority tasks at the cap', () => {
    const lowPriorityRule = {
      schema_version: 'v1' as const,
      id: 'low-priority',
      title: 'Низкий приоритет',
      scope: { task_type_ids: ['ordinary'] },
      rules: [
        {
          id: 'low',
          kind: 'priority' as const,
          level: 'low' as const,
          reason: 'Не срочно',
        },
      ],
    };
    const highPriorityRule = {
      ...lowPriorityRule,
      id: 'high-priority',
      scope: { task_type_ids: ['urgent'] },
      rules: [
        {
          id: 'high',
          kind: 'priority' as const,
          level: 'high' as const,
          reason: 'Срочно',
        },
      ],
    };
    const lowPriorityTasks = Array.from({ length: 100 }, (_, index) =>
      task(`low-${String(index).padStart(3, '0')}`, {
        typeId: 'ordinary',
      }),
    );
    const overdue = task('overdue', {
      deadline: today.subtract({ days: 1 }),
    });
    const highPriority = task('high-priority', { typeId: 'urgent' });
    const result = buildContext(
      input({
        tasks: [...lowPriorityTasks, overdue, highPriority],
        activeRules: [lowPriorityRule, highPriorityRule],
      }),
    );

    expect(result.tasks).toHaveLength(100);
    expect(result.tasks.some(({ id }) => id === 'overdue')).toBe(true);
    expect(
      result.tasks.findIndex(({ id }) => id === 'high-priority'),
    ).toBeLessThan(result.tasks.findIndex(({ id }) => id === 'overdue'));
  });

  it('ranks effective high priority before truncating tasks', () => {
    const priorityRule = {
      schema_version: 'v1' as const,
      id: 'priority',
      title: 'Приоритет',
      scope: { task_type_ids: ['lab'] },
      rules: [
        {
          id: 'high',
          kind: 'priority' as const,
          level: 'high' as const,
          reason: 'Срочно',
        },
      ],
    };
    const ordinary = Array.from({ length: 100 }, (_, index) =>
      task(`ordinary-${String(index).padStart(3, '0')}`),
    );
    const result = buildContext({
      ...input(),
      tasks: [...ordinary, task('priority-task', { typeId: 'lab' })],
      activeRules: [priorityRule],
    });

    expect(result.tasks).toHaveLength(100);
    expect(result.tasks.some(({ id }) => id === 'priority-task')).toBe(true);
  });

  it('includes a currently active fixed event', () => {
    const start = Temporal.ZonedDateTime.from(
      '2026-10-05T09:00-07:00[America/Los_Angeles]',
    );
    const end = start.add({ hours: 1 });
    const result = buildContext(
      input({
        now: Temporal.ZonedDateTime.from(
          '2026-10-05T09:30-07:00[America/Los_Angeles]',
        ),
        schedule: {
          events: [
            { key: 'active', source: 'manual', title: 'Занятие', start, end },
          ],
          fetchedAt: now,
          source: 'manual',
          status: 'ok',
        },
      }),
    );

    expect(result.schedule?.nearestFixedEvents[0]?.key).toBe('active');
  });

  it('preserves schedule status and fetched time in context fingerprints', () => {
    const failed = buildContext(
      input({
        schedule: {
          events: [],
          fetchedAt: now.subtract({ hours: 2 }),
          source: 'manual',
          status: 'error',
        },
      }),
    );
    const successful = buildContext(
      input({
        schedule: {
          events: [],
          fetchedAt: now,
          source: 'manual',
          status: 'ok',
        },
      }),
    );

    expect(failed.schedule).toMatchObject({
      status: 'error',
      fetchedAt: now.subtract({ hours: 2 }).toString(),
    });
    expect(contextFingerprint(failed)).not.toBe(contextFingerprint(successful));
  });
});
