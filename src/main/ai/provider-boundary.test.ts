import { createAiReferenceIndex } from '../../shared/ai-reference-index';
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
  columns: [{ id: 'todo' }],
  taskTypes: [{ id: 'type-1' }],
};
const references = createAiReferenceIndex({
  columns: [
    { id: 'todo', state: 'todo' },
    { id: 'waiting', state: 'waiting' },
  ],
  taskTypes: [{ id: 'type-1' }],
  disciplines: [{ id: 'discipline-1' }],
  rules: [{ id: 'rule-1' }],
  tasks: [
    {
      id: 'task-1',
      subtasks: [{ id: 'context-subtask' }],
      comments: [{ id: 'context-comment' }],
    },
  ],
});
function validate(reply: unknown, context: unknown = nestedContext) {
  return validateProviderReply(reply, context, references);
}

it('validates the #45 AiContext shape with a private reference index', async () => {
  const aiContext = {
    instructions: 'Only propose typed commands.',
    today: '2026-10-06',
    now: '2026-10-06T09:00:00Z',
    tasks: [
      {
        id: 'task-1',
        typeId: 'type-1',
        disciplineId: 'discipline-1',
        state: 'todo',
        availability: 'today',
        deadlineRisk: { kind: 'none' },
        rules: {
          trust: 'untrusted',
          effectivePriority: null,
          conflict: false,
          reference: [],
        },
        untrusted: {
          trust: 'untrusted',
          title: 'Visible task',
          comments: [],
          subtasks: [],
          attachments: [],
        },
      },
    ],
    completedCount: 1,
    omittedTaskCount: 2,
    missedRepeats: [],
    taskTypes: [{ trust: 'untrusted', id: 'type-1', name: 'Type' }],
    disciplines: [
      { trust: 'untrusted', id: 'discipline-1', name: 'Discipline' },
    ],
    workdays: [1, 2, 3, 4, 5],
    schedule: { nearestFixedEvents: [] },
  };
  const commands = [
    {
      kind: 'task.create',
      task: { id: 'new-task', title: 'New', columnId: 'todo', subtasks: [] },
    },
    { kind: 'task.move', id: 'task-1', columnId: 'todo' },
    { kind: 'rule.activate', ruleId: 'rule-1' },
  ];
  const provider = new ManualExchangeProvider();
  const pending = provider.ask(
    {
      operationId: 'context-references',
      context: aiContext,
      referenceIndex: references,
      instruction: 'Return a proposal',
      responseSchema: { type: 'object' },
    },
    new AbortController().signal,
  );
  await Promise.resolve();
  const prompt = provider.getPrompt('context-references');
  expect(prompt).toContain(JSON.stringify(aiContext, null, 2));
  expect(prompt).not.toContain('rule-1');
  expect(
    provider.provideReply(
      'context-references',
      JSON.stringify({ ...proposal, commands }),
    ),
  ).toBe(true);
  expect(await pending).toEqual({
    ok: true,
    value: { ...proposal, commands },
  });
});

it('checks IDs hidden from model context against the full reference index', () => {
  const fullReferences = createAiReferenceIndex({
    columns: [
      { id: 'todo', state: 'todo' },
      { id: 'waiting', state: 'waiting' },
    ],
    taskTypes: [{ id: 'type-1' }],
    disciplines: [{ id: 'discipline-1' }],
    rules: [{ id: 'rule-1' }],
    tasks: [
      {
        id: 'task-1',
        subtasks: [{ id: 'context-subtask' }, { id: 'hidden-subtask' }],
        comments: [{ id: 'context-comment' }, { id: 'existing-comment' }],
      },
      { id: 'completed-task', subtasks: [], comments: [] },
      { id: 'over-limit-task', subtasks: [], comments: [] },
    ],
  });
  const hiddenCollisions = [
    {
      kind: 'task.create',
      task: {
        id: 'completed-task',
        title: 'Duplicate hidden task',
        columnId: 'todo',
        subtasks: [],
      },
    },
    {
      kind: 'task.create',
      task: {
        id: 'over-limit-task',
        title: 'Duplicate over-limit task',
        columnId: 'todo',
        subtasks: [],
      },
    },
    {
      kind: 'subtask.add',
      taskId: 'task-1',
      subtask: { id: 'hidden-subtask', title: 'Duplicate', completed: false },
    },
    {
      kind: 'comment.add',
      taskId: 'task-1',
      comment: { id: 'existing-comment', text: 'Duplicate' },
    },
  ];
  for (const command of hiddenCollisions) {
    expect(
      validateProviderReply(
        { ...proposal, commands: [command] },
        { tasks: [{ id: 'task-1' }] },
        fullReferences,
      ),
    ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
  }
  const freshCommands = [
    {
      kind: 'task.create',
      task: {
        id: 'fresh-task',
        title: 'Fresh task',
        columnId: 'todo',
        subtasks: [{ id: 'fresh-subtask', title: 'Fresh', completed: false }],
        comment: { id: 'fresh-comment', text: 'Fresh' },
      },
    },
    {
      kind: 'subtask.add',
      taskId: 'task-1',
      subtask: {
        id: 'another-fresh-subtask',
        title: 'Fresh',
        completed: false,
      },
    },
    {
      kind: 'comment.add',
      taskId: 'task-1',
      comment: { id: 'another-fresh-comment', text: 'Fresh' },
    },
  ];
  expect(
    validateProviderReply(
      { ...proposal, commands: freshCommands },
      { tasks: [{ id: 'task-1' }] },
      fullReferences,
    ),
  ).toEqual({ ok: true, value: { ...proposal, commands: freshCommands } });
});

it('enforces target column status semantics for move and create', () => {
  const validCommands = [
    {
      kind: 'task.move',
      id: 'task-1',
      columnId: 'todo',
      status: { kind: 'todo' },
    },
    {
      kind: 'task.move',
      id: 'task-1',
      columnId: 'waiting',
      status: { kind: 'waiting', reason: 'Blocked' },
    },
    {
      kind: 'task.create',
      task: { id: 'new-task', title: 'New', columnId: 'todo', subtasks: [] },
    },
  ];
  expect(validate({ ...proposal, commands: validCommands })).toEqual({
    ok: true,
    value: { ...proposal, commands: validCommands },
  });
  const invalidCommands = [
    {
      kind: 'task.move',
      id: 'task-1',
      columnId: 'todo',
      status: { kind: 'waiting', reason: 'Blocked' },
    },
    { kind: 'task.move', id: 'task-1', columnId: 'waiting' },
    {
      kind: 'task.move',
      id: 'task-1',
      columnId: 'waiting',
      status: { kind: 'waiting', reason: '  ' },
    },
    {
      kind: 'task.create',
      task: {
        id: 'waiting-task',
        title: 'Waiting',
        columnId: 'waiting',
        subtasks: [],
      },
    },
  ];
  for (const command of invalidCommands) {
    expect(validate({ ...proposal, commands: [command] })).toEqual({
      ok: false,
      error: { kind: 'InvalidReply' },
    });
  }
});

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
    expect(validate({ ...proposal, commands: validReferences })).toEqual({
      ok: true,
      value: { ...proposal, commands: validReferences },
    });
    expect(validate({ ...proposal, commands })).toEqual({
      ok: false,
      error: { kind: 'InvalidReply' },
    });
    const duplicateComment = [
      ...commands.slice(0, 3),
      {
        kind: 'comment.add',
        taskId: 'created-task',
        comment: { id: 'new-comment', text: 'Duplicate' },
      },
    ];
    expect(validate({ ...proposal, commands: duplicateComment })).toEqual({
      ok: false,
      error: { kind: 'InvalidReply' },
    });

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
      expect(validate({ ...proposal, commands: [command] })).toEqual({
        ok: false,
        error: { kind: 'InvalidReply' },
      });
    }
  });
  it('validates task column references against the request context', () => {
    const validCommands = [
      {
        kind: 'task.create',
        task: {
          id: 'created-task',
          title: 'Created task',
          columnId: 'todo',
          subtasks: [],
        },
      },
      { kind: 'task.move', id: 'task-1', columnId: 'todo' },
      { kind: 'task.move', id: 'created-task', columnId: 'todo' },
    ];
    expect(validate({ ...proposal, commands: validCommands })).toEqual({
      ok: true,
      value: { ...proposal, commands: validCommands },
    });

    const invalidCommands = [
      { kind: 'task.move', id: 'task-1', columnId: 'missing-column' },
      {
        kind: 'task.create',
        task: {
          id: 'another-task',
          title: 'Another task',
          columnId: 'missing-column',
          subtasks: [],
        },
      },
    ];
    const invalidResults = invalidCommands.map((command) =>
      validate({ ...proposal, commands: [command] }),
    );
    expect(invalidResults).toEqual([
      { ok: false, error: { kind: 'InvalidReply' } },
      { ok: false, error: { kind: 'InvalidReply' } },
    ]);
  });
  it('validates task type references against the request context', () => {
    const command = {
      kind: 'task.create',
      task: {
        id: 'typed-task',
        title: 'Typed task',
        columnId: 'todo',
        typeId: 'type-1',
        subtasks: [],
      },
    };
    expect(validate({ ...proposal, commands: [command] })).toEqual({
      ok: true,
      value: { ...proposal, commands: [command] },
    });

    const unknownTypeCommand = {
      ...command,
      task: { ...command.task, typeId: 'missing-type' },
    };
    expect(validate({ ...proposal, commands: [unknownTypeCommand] })).toEqual({
      ok: false,
      error: { kind: 'InvalidReply' },
    });
  });

  it('returns raw provider JSON for the scenario parser', async () => {
    const provider = new ManualExchangeProvider();
    const runner = new AiRunner(provider);
    const resultPromise = runner.run({
      operationId: 'operation-1',
      context: { tasks: [{ id: 'task-1' }] },
      referenceIndex: references,
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
    expect(await resultPromise).toMatchObject({
      ok: true,
      value: {
        commands: [
          {
            task: {
              day: '2026-10-06',
              time: '09:30',
              deadline: '2026-10-09',
            },
          },
        ],
      },
    });
  });
});
