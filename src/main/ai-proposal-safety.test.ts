import { describe, expect, it } from 'vitest';
import type { Task } from '../domain';
import { aiCommandSchema } from '../shared/ai-commands';
import {
  toStorageCommands,
  validateProposal,
  type AiSnapshot,
} from './ai-proposals';

const task: Task = {
  id: 'task-1',
  title: 'Task',
  status: { kind: 'todo' },
  columnId: 'todo',
  subtasks: [],
  comments: [],
  attachments: [],
  addedOrder: 0,
};
const snapshot: AiSnapshot = {
  revision: 4,
  ruleVersions: { rules: 'v1' },
  tasks: [task],
  columns: [
    { id: 'todo', name: 'Todo', description: '', state: 'todo', builtIn: true },
    {
      id: 'doing',
      name: 'Doing',
      description: '',
      state: 'doing',
      builtIn: true,
    },
    {
      id: 'waiting',
      name: 'Waiting',
      description: '',
      state: 'waiting',
      builtIn: true,
    },
  ],
  taskTypes: [{ id: 'type-1', name: 'Type' }],
  disciplines: [{ id: 'discipline-1', name: 'Discipline' }],
  rules: [],
};
const proposal = (commands: unknown[]) => ({
  id: 'proposal-1',
  baseRevision: 4,
  ruleVersions: { rules: 'v1' },
  commands,
  rationale: 'Reason',
  unknowns: [],
  createdAt: '2026-10-05T10:00:00Z',
});

describe('AI task safety contract', () => {
  it('rejects service-field updates while preserving valid commands', () => {
    const serviceChanges = {
      status: { kind: 'todo' },
      rolledOverFrom: '2026-10-05',
      addedOrder: 10,
    };
    for (const [field, value] of Object.entries(serviceChanges)) {
      const result = validateProposal(
        proposal([
          { kind: 'task.update', id: 'task-1', changes: { [field]: value } },
          {
            kind: 'comment.add',
            taskId: 'task-1',
            comment: { id: 'safe-note', text: 'Note' },
          },
        ]),
        snapshot,
      );
      expect(result.validCommands).toHaveLength(1);
      expect(result.rejectedCommands[0]).toMatchObject({
        index: 0,
        kind: 'task.update',
        reason: 'invalid-command',
      });
    }
    expect(
      aiCommandSchema.safeParse({
        kind: 'task.update',
        id: 'task-1',
        changes: { title: 'Updated', estimate: { unit: 'workdays', value: 1 } },
      }).success,
    ).toBe(true);
  });
  it('rejects system fields and existing task identifiers on creation', () => {
    const taskInput = {
      id: 'new',
      title: 'New',
      columnId: 'todo',
      subtasks: [],
    };
    for (const field of ['addedOrder', 'rolledOverFrom', 'aiRank']) {
      expect(
        aiCommandSchema.safeParse({
          kind: 'task.create',
          task: { ...taskInput, [field]: 1 },
        }).success,
      ).toBe(false);
    }
    const result = validateProposal(
      proposal([
        { kind: 'task.create', task: { ...taskInput, id: 'task-1' } },
        {
          kind: 'comment.add',
          taskId: 'task-1',
          comment: { id: 'safe-note', text: 'Note' },
        },
      ]),
      snapshot,
    );
    expect(result.validCommands).toHaveLength(1);
    expect(result.rejectedCommands).toEqual([
      { index: 0, kind: 'task.create', reason: 'task-id-conflict' },
    ]);
  });

  it('rejects waiting-column creation without a waiting reason', () => {
    const result = validateProposal(
      proposal([
        {
          kind: 'task.create',
          task: {
            id: 'new',
            title: 'New',
            columnId: 'waiting',
            subtasks: [],
          },
        },
      ]),
      snapshot,
    );
    expect(result.rejectedCommands[0]?.reason).toBe('waiting-reason-required');
  });

  it('accepts commands that reference a task created earlier in the proposal', () => {
    const create = {
      kind: 'task.create',
      task: { id: 'created', title: 'Created', columnId: 'todo', subtasks: [] },
    };
    const update = {
      kind: 'task.update',
      id: 'created',
      changes: { title: 'Updated' },
    };
    const result = validateProposal(proposal([create, update]), snapshot);

    expect(result.validCommands).toEqual([create, update]);
    expect(result.rejectedCommands).toEqual([]);
  });
  it('rejects nested IDs repeated within a proposal while preserving independent commands', () => {
    const commands = [
      {
        kind: 'subtask.add',
        taskId: 'task-1',
        subtask: { id: 'new-subtask', title: 'First', completed: false },
      },
      {
        kind: 'subtask.add',
        taskId: 'task-1',
        subtask: { id: 'new-subtask', title: 'Duplicate', completed: false },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'new-comment', text: 'First' },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'new-comment', text: 'Duplicate' },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'independent-comment', text: 'Independent' },
      },
    ];
    const result = validateProposal(proposal(commands), snapshot);

    expect(result.validCommands).toEqual([
      commands[0],
      commands[2],
      commands[4],
    ]);
    expect(result.rejectedCommands).toEqual([
      { index: 1, kind: 'subtask.add', reason: 'subtask-id-conflict' },
      { index: 3, kind: 'comment.add', reason: 'comment-id-conflict' },
    ]);
  });

  it('rejects duplicate nested ids while preserving independent commands', () => {
    const currentSnapshot = {
      ...snapshot,
      tasks: [
        {
          ...task,
          subtasks: [
            {
              id: 'sub-existing',
              title: 'Existing',
              completed: false,
              position: 0,
            },
          ],
          comments: [
            { id: 'comment-existing', text: 'Existing', createdAt: null },
          ],
        },
      ],
    };
    const commands = [
      {
        kind: 'subtask.add',
        taskId: 'task-1',
        subtask: { id: 'sub-existing', title: 'Duplicate', completed: false },
      },
      {
        kind: 'subtask.add',
        taskId: 'task-1',
        subtask: { id: 'sub-new', title: 'New', completed: false },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'comment-existing', text: 'Duplicate' },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'comment-new', text: 'New' },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'independent-comment', text: 'Independent' },
      },
    ];
    const result = validateProposal(proposal(commands), currentSnapshot);

    expect(result.validCommands).toEqual([
      commands[1],
      commands[3],
      commands[4],
    ]);
    expect(result.rejectedCommands).toEqual([
      { index: 0, kind: 'subtask.add', reason: 'subtask-id-conflict' },
      { index: 2, kind: 'comment.add', reason: 'comment-id-conflict' },
    ]);
  });

  it('rejects duplicate nested ids within a task creation', () => {
    const create = {
      kind: 'task.create',
      task: {
        id: 'created',
        title: 'Created',
        columnId: 'todo',
        subtasks: [
          { id: 'same-subtask', title: 'One', completed: false },
          { id: 'same-subtask', title: 'Two', completed: false },
        ],
        comment: { id: 'same-comment', text: 'Comment' },
      },
    };
    const independent = {
      kind: 'comment.add',
      taskId: 'task-1',
      comment: { id: 'independent-comment', text: 'Independent' },
    };
    const result = validateProposal(proposal([create, independent]), snapshot);

    expect(result.validCommands).toEqual([independent]);
    expect(result.rejectedCommands).toEqual([
      { index: 0, kind: 'task.create', reason: 'subtask-id-conflict' },
    ]);
  });

  it('rejects duplicate task ids in one proposal without changing snapshot tasks', () => {
    const beforeTasks = structuredClone(snapshot.tasks);
    const commands = [
      {
        kind: 'task.create',
        task: { id: 'new', title: 'First', columnId: 'todo', subtasks: [] },
      },
      {
        kind: 'task.create',
        task: {
          id: 'new',
          title: 'Duplicate',
          columnId: 'doing',
          subtasks: [],
        },
      },
      {
        kind: 'comment.add',
        taskId: 'task-1',
        comment: { id: 'independent-comment', text: 'Independent' },
      },
    ];
    const result = validateProposal(proposal(commands), snapshot);

    expect(result.validCommands).toEqual([commands[0], commands[2]]);
    expect(result.rejectedCommands).toEqual([
      { index: 1, kind: 'task.create', reason: 'task-id-conflict' },
    ]);
    expect(snapshot.tasks).toEqual(beforeTasks);
  });

  it('assigns unique sequential added orders to tasks created in one proposal', () => {
    const currentSnapshot = {
      ...snapshot,
      tasks: [task, { ...task, id: 'task-2', addedOrder: 8 }],
    };
    const inputs = [
      { id: 'new-1', title: 'First', columnId: 'doing', subtasks: [] },
      { id: 'new-2', title: 'Second', columnId: 'doing', subtasks: [] },
    ];
    const result = validateProposal(
      proposal(inputs.map((input) => ({ kind: 'task.create', task: input }))),
      currentSnapshot,
    );
    const translated = toStorageCommands(result.validCommands, currentSnapshot);
    const addedOrders = translated.commands.map((command) =>
      command.kind === 'task.create' ? command.task.addedOrder : undefined,
    );

    expect(result.validCommands).toHaveLength(2);
    expect(addedOrders).toEqual([9, 10]);
  });

  it('derives created task system fields from the snapshot', () => {
    const currentSnapshot = {
      ...snapshot,
      tasks: [task, { ...task, id: 'task-2', addedOrder: 8 }],
    };
    const input = {
      id: 'new',
      title: 'New',
      columnId: 'doing',
      subtasks: [{ id: 'sub-1', title: 'Subtask', completed: false }],
      comment: { id: 'comment-1', text: 'Context' },
    };
    const result = validateProposal(
      proposal([{ kind: 'task.create', task: input }]),
      currentSnapshot,
    );
    expect(toStorageCommands(result.validCommands, currentSnapshot)).toEqual({
      commands: [
        {
          kind: 'task.create',
          task: {
            id: input.id,
            title: input.title,
            columnId: input.columnId,
            subtasks: input.subtasks,
            status: { kind: 'doing' },
            comments: [input.comment],
            attachments: [],
            addedOrder: 9,
          },
        },
      ],
      source: 'ai',
    });
  });
});
