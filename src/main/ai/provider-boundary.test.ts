import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import type { Proposal } from '../../shared/ai-commands';
import { AiRunner } from './ai-runner';
import { ManualExchangeProvider } from './manual-exchange-provider';
import { validateProviderReply } from './provider-reply';

const proposal: Proposal = {
  id: 'proposal-1',
  baseRevision: 1,
  ruleVersions: {},
  commands: [],
  rationale: 'Create a task',
  unknowns: [],
  createdAt: '2026-10-05T12:00:00Z',
};
const nestedContext = {
  tasks: [
    {
      id: 'task-1',
      subtasks: [{ id: 'context-subtask' }],
      comments: [{ id: 'context-comment' }],
    },
  ],
};

describe('AI provider boundary', () => {
  it('rejects duplicate nested IDs from context and earlier commands', () => {
    const created = {
      id: 'created-task',
      title: 'Created task',
      columnId: 'todo',
      subtasks: [{ id: 'new-subtask', title: 'Subtask', completed: false }],
      comment: { id: 'new-comment', text: 'Comment' },
    };
    const commands = [
      { kind: 'task.create', task: created },
      {
        kind: 'task.update',
        id: 'created-task',
        changes: { title: 'Updated' },
      },
      { kind: 'task.setAiRank', taskId: 'created-task', rank: 1 },
      {
        kind: 'subtask.add',
        taskId: 'created-task',
        subtask: { id: 'new-subtask', title: 'Duplicate', completed: false },
      },
    ];
    const validReferences = [
      ...commands.slice(0, 3),
      {
        kind: 'subtask.add',
        taskId: 'created-task',
        subtask: { id: 'next-subtask', title: 'Next', completed: false },
      },
      {
        kind: 'comment.add',
        taskId: 'created-task',
        comment: { id: 'next-comment', text: 'Next' },
      },
    ];
    expect(
      validateProviderReply(
        { ...proposal, commands: validReferences },
        nestedContext,
      ),
    ).toEqual({
      ok: true,
      value: { ...proposal, commands: validReferences },
    });
    expect(
      validateProviderReply({ ...proposal, commands }, nestedContext),
    ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
    const duplicateComment = [
      ...commands.slice(0, 3),
      {
        kind: 'comment.add',
        taskId: 'created-task',
        comment: { id: 'new-comment', text: 'Duplicate' },
      },
    ];
    expect(
      validateProviderReply(
        { ...proposal, commands: duplicateComment },
        nestedContext,
      ),
    ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });

    const invalidReferences = [
      {
        kind: 'subtask.add',
        taskId: 'task-1',
        subtask: {
          id: 'context-subtask',
          title: 'Duplicate context ID',
          completed: false,
        },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'context-comment', text: 'Duplicate context ID' },
      },
      {
        kind: 'task.create',
        task: {
          id: 'other-task',
          title: 'Other task',
          columnId: 'todo',
          subtasks: [
            { id: 'context-subtask', title: 'Duplicate', completed: false },
          ],
        },
      },
      {
        kind: 'task.create',
        task: {
          id: 'comment-conflict',
          title: 'Comment conflict',
          columnId: 'todo',
          subtasks: [],
          comment: { id: 'context-comment', text: 'Duplicate' },
        },
      },
      {
        kind: 'task.create',
        task: {
          id: 'duplicate-subtasks',
          title: 'Repeated nested ID',
          columnId: 'todo',
          subtasks: [
            { id: 'same-subtask', title: 'One', completed: false },
            { id: 'same-subtask', title: 'Two', completed: false },
          ],
        },
      },
    ];
    for (const command of invalidReferences) {
      expect(
        validateProviderReply(
          { ...proposal, commands: [command] },
          nestedContext,
        ),
      ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
    }
  });

  it('returns parsed Temporal task fields from the runner for IPC serialization', async () => {
    const provider = new ManualExchangeProvider();
    const runner = new AiRunner(provider);
    const resultPromise = runner.run({
      operationId: 'operation-1',
      context: { tasks: [{ id: 'task-1' }] },
      instruction: 'Return a proposal',
      responseSchema: { type: 'object' },
    });
    await Promise.resolve();
    expect(
      provider.provideReply(
        'operation-1',
        JSON.stringify({
          ...proposal,
          commands: [
            {
              kind: 'task.create',
              task: {
                id: 'dated-task',
                title: 'Dated task',
                columnId: 'todo',
                subtasks: [],
                day: '2026-10-06',
                time: '09:30',
                deadline: '2026-10-09',
              },
            },
          ],
        }),
      ),
    ).toBe(true);
    const result = await resultPromise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const command = result.value.commands[0];
    expect(command?.kind).toBe('task.create');
    if (command?.kind !== 'task.create') return;
    expect(command.task.day).toBeInstanceOf(Temporal.PlainDate);
    expect(command.task.time).toBeInstanceOf(Temporal.PlainTime);
    expect(command.task.deadline).toBeInstanceOf(Temporal.PlainDate);
  });
});
