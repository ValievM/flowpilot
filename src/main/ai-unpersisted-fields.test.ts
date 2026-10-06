import { describe, expect, it } from 'vitest';
import { validateProposal } from './ai-proposals';
import type { AiSnapshot } from './ai-proposals';

const snapshot: AiSnapshot = {
  revision: 4,
  ruleVersions: {},
  tasks: [
    {
      id: 'task-1',
      title: 'Task',
      status: { kind: 'todo' },
      columnId: 'todo',
      subtasks: [],
      comments: [],
      attachments: [],
      addedOrder: 0,
    },
  ],
  columns: [
    { id: 'todo', name: 'Todo', description: '', state: 'todo', builtIn: true },
  ],
  taskTypes: [{ id: 'type-1', name: 'Type' }],
  disciplines: [{ id: 'discipline-1', name: 'Discipline' }],
  rules: [],
};

const proposal = {
  id: 'proposal-1',
  baseRevision: 4,
  ruleVersions: {},
  commands: [
    { kind: 'task.classify', taskId: 'task-1', typeId: 'type-1' },
    { kind: 'task.setAiRank', taskId: 'task-1', rank: 2 },
    {
      kind: 'task.create',
      task: {
        id: 'task-2',
        title: 'Classified task',
        columnId: 'todo',
        typeId: 'type-1',
        disciplineId: 'discipline-1',
        subtasks: [],
      },
    },
    {
      kind: 'comment.add',
      taskId: 'task-1',
      comment: { id: 'comment-1', text: 'Context' },
    },
  ],
  rationale: 'Reason',
  unknowns: [],
  createdAt: '2026-10-05T10:00:00Z',
};

describe('AI commands for fields not persisted yet', () => {
  it('rejects unpersisted fields individually while preserving other commands', () => {
    const result = validateProposal(proposal, snapshot);

    expect(result.validCommands).toEqual([proposal.commands[3]]);
    expect(result.rejectedCommands).toEqual([
      { index: 0, kind: 'task.classify', reason: 'not-persisted-yet' },
      { index: 1, kind: 'task.setAiRank', reason: 'not-persisted-yet' },
      { index: 2, kind: 'task.create', reason: 'not-persisted-yet' },
    ]);
  });
});
