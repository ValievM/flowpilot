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
          { kind: 'task.setAiRank', taskId: 'task-1', rank: 2 },
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
        { kind: 'task.setAiRank', taskId: 'task-1', rank: 2 },
      ]),
      snapshot,
    );
    expect(result.validCommands).toHaveLength(1);
    expect(result.rejectedCommands[0]?.reason).toBe('task-id-conflict');
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

  it('derives created task system fields from the snapshot', () => {
    const currentSnapshot = {
      ...snapshot,
      tasks: [task, { ...task, id: 'task-2', addedOrder: 8 }],
    };
    const input = {
      id: 'new',
      title: 'New',
      columnId: 'doing',
      typeId: 'type-1',
      disciplineId: 'discipline-1',
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
            typeId: input.typeId,
            disciplineId: input.disciplineId,
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
