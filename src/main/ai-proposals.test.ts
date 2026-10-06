import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import type { Task } from '../domain';
import { aiCommandSchema, proposalSchema } from '../shared/ai-commands';
import { ipcCommandSchema } from '../shared/command-schema';
import {
  isStale,
  toStorageCommands,
  validateProposal,
  type AiSnapshot,
} from './ai-proposals';

const task: Task = {
  id: 'task-1',
  title: 'Task',
  status: { kind: 'todo' },
  columnId: 'todo',
  day: Temporal.PlainDate.from('2026-10-05'),
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
      id: 'waiting',
      name: 'Waiting',
      description: '',
      state: 'waiting',
      builtIn: true,
    },
  ],
  taskTypes: [{ id: 'type-1', name: 'Type' }],
  disciplines: [{ id: 'discipline-1', name: 'Discipline' }],
  savedRuleIds: [],
  rules: [],
};
const proposal = (
  commands: unknown[],
  overrides: Record<string, unknown> = {},
) => ({
  id: 'proposal-1',
  baseRevision: 4,
  ruleVersions: { rules: 'v1' },
  commands,
  rationale: 'Reason',
  unknowns: [],
  createdAt: '2026-10-05T10:00:00Z',
  ...overrides,
});

describe('AI proposal contract', () => {
  it('rejects unsupported fields while keeping valid commands', () => {
    const result = validateProposal(
      proposal([
        { kind: 'task.setAiRank', taskId: 'task-1', rank: 0 },
        { kind: 'task.classify', taskId: 'task-1', typeId: 'type-1' },
        {
          kind: 'comment.add',
          taskId: 'task-1',
          comment: { id: 'comment-1', text: 'Context' },
        },
      ]),
      snapshot,
    );
    expect(result.validCommands).toHaveLength(3);
    expect(result.rejectedCommands).toEqual([]);
  });
  it('keeps valid commands and rejects hallucinated task identifiers by name', () => {
    const result = validateProposal(
      proposal([
        { kind: 'task.setAiRank', taskId: 'task-1', rank: 0 },
        {
          kind: 'comment.add',
          taskId: 'imagined',
          comment: { id: 'c1', text: 'Note' },
        },
        { kind: 'task.classify', taskId: 'task-1', typeId: 'type-1' },
      ]),
      snapshot,
    );
    expect(result.validCommands).toEqual([
      { kind: 'task.setAiRank', taskId: 'task-1', rank: 0 },
      { kind: 'task.classify', taskId: 'task-1', typeId: 'type-1' },
    ]);
    expect(result.rejectedCommands).toEqual([
      { index: 1, kind: 'comment.add', reason: 'task-not-found' },
    ]);
  });

  it('rejects unknown keys and forbidden deletion commands', () => {
    expect(
      aiCommandSchema.safeParse({
        kind: 'task.classify',
        taskId: 'task-1',
        typeId: 'type-1',
        extra: true,
      }).success,
    ).toBe(false);
    const result = validateProposal(
      proposal([
        {
          kind: 'task.classify',
          taskId: 'task-1',
          typeId: 'type-1',
          extra: true,
        },
        { kind: 'task.setAiRank', taskId: 'task-1', rank: 0 },
      ]),
      snapshot,
    );
    expect(result.validCommands).toEqual([
      { kind: 'task.setAiRank', taskId: 'task-1', rank: 0 },
    ]);
    expect(result.rejectedCommands).toEqual([
      { index: 0, kind: 'task.classify', reason: 'invalid-command' },
    ]);
    expect(
      aiCommandSchema.safeParse({ kind: 'task.delete', taskId: 'task-1' })
        .success,
    ).toBe(false);
    expect(
      aiCommandSchema.safeParse({
        kind: 'attachment.add',
        taskId: 'task-1',
        attachment: {},
      }).success,
    ).toBe(false);
  });

  it('rejects catalog ids outside the supplied snapshot', () => {
    const result = validateProposal(
      proposal([
        { kind: 'task.classify', taskId: 'task-1', typeId: 'missing' },
      ]),
      snapshot,
    );
    expect(result.rejectedCommands[0]?.reason).toBe('type-not-found');
  });

  it('requires an explicit reason when moving into waiting', () => {
    const result = validateProposal(
      proposal([{ kind: 'task.move', id: 'task-1', columnId: 'waiting' }]),
      snapshot,
    );
    expect(result.rejectedCommands[0]?.reason).toBe('waiting-reason-required');
  });

  it('requires estimates to use whole workdays and rejects hours', () => {
    const command = {
      kind: 'task.create',
      task: {
        id: 'new-task',
        title: 'New',
        columnId: 'todo',
        subtasks: [],
        estimate: { unit: 'hours', value: 3 },
      },
    };
    expect(aiCommandSchema.safeParse(command).success).toBe(false);
  });

  it('rejects task creation with type ids not yet persisted', () => {
    const command = {
      kind: 'task.create',
      task: {
        id: 'new',
        title: 'New',
        columnId: 'todo',
        typeId: 'missing',
        subtasks: [],
      },
    };
    const result = validateProposal(
      proposal([
        command,
        { kind: 'task.setAiRank', taskId: 'task-1', rank: 2 },
      ]),
      snapshot,
    );
    expect(result.validCommands).toEqual([
      { kind: 'task.setAiRank', taskId: 'task-1', rank: 2 },
    ]);
    expect(result.rejectedCommands).toEqual([
      { index: 0, kind: 'task.create', reason: 'not-persisted-yet' },
    ]);
  });

  it('uses stale revision and rule versions to reject all commands', () => {
    const candidate = proposal([
      { kind: 'task.setAiRank', taskId: 'task-1', rank: 0 },
    ]);
    expect(isStale(candidate, 5, { rules: 'v1' })).toBe(true);
    expect(isStale(candidate, 4, { rules: 'v2' })).toBe(true);
    expect(
      validateProposal(candidate, { ...snapshot, revision: 5 })
        .rejectedCommands[0]?.reason,
    ).toBe('stale-proposal');
  });

  it('preserves an ambiguous deadline as an unknown instead of inventing a date', () => {
    const result = validateProposal(
      proposal(
        [
          {
            kind: 'task.create',
            task: {
              id: 'new',
              title: 'New',
              columnId: 'todo',
              subtasks: [],
            },
          },
        ],
        { unknowns: ['deadline: Friday is ambiguous'] },
      ),
      snapshot,
    );
    const created = result.validCommands[0];
    expect(created?.kind).toBe('task.create');
    if (created?.kind === 'task.create') {
      expect(created.task.deadline).toBeUndefined();
    }
    const parsed = proposalSchema.parse(
      proposal([], { unknowns: ['deadline: Friday is ambiguous'] }),
    );
    expect(parsed.unknowns).toContain('deadline: Friday is ambiguous');
  });
  it('validates imported rule documents against their catalog ids', () => {
    const documentJson = JSON.stringify({
      schema_version: 'v1',
      id: 'rule-1',
      title: 'Priority',
      scope: { task_type_ids: ['type-1'] },
      rules: [
        { id: 'important', kind: 'priority', level: 'high', reason: 'Reason' },
      ],
    });
    const accepted = validateProposal(
      proposal([{ kind: 'rule.import', documentJson }]),
      snapshot,
    );
    expect(accepted.validCommands).toHaveLength(1);
    const unknownTypeJson = documentJson.replace('type-1', 'missing');
    const rejected = validateProposal(
      proposal([{ kind: 'rule.import', documentJson: unknownTypeJson }]),
      snapshot,
    );
    expect(rejected.rejectedCommands[0]?.reason).toBe('type-not-found');
  });
  it('activates a rule imported earlier in the same proposal', () => {
    const documentJson = JSON.stringify({
      schema_version: 'v1',
      id: 'rule-1',
      title: 'Priority',
      scope: { task_type_ids: ['type-1'] },
      rules: [
        { id: 'important', kind: 'priority', level: 'high', reason: 'Reason' },
      ],
    });
    const result = validateProposal(
      proposal([
        { kind: 'rule.import', documentJson },
        { kind: 'rule.activate', ruleId: 'rule-1' },
      ]),
      snapshot,
    );
    expect(result.rejectedCommands).toEqual([]);
    expect(result.validCommands).toEqual([
      { kind: 'rule.import', documentJson },
      { kind: 'rule.activate', ruleId: 'rule-1' },
    ]);
  });
  it('rejects activation of rules that are unknown or invalid imports', () => {
    const invalidJson = JSON.stringify({
      schema_version: 'v1',
      id: 'broken-rule',
      title: 'Priority',
      scope: { task_type_ids: ['missing'] },
      rules: [
        { id: 'important', kind: 'priority', level: 'high', reason: 'Reason' },
      ],
    });
    const result = validateProposal(
      proposal([
        { kind: 'rule.import', documentJson: invalidJson },
        { kind: 'rule.activate', ruleId: 'broken-rule' },
        { kind: 'rule.activate', ruleId: 'never-seen' },
      ]),
      snapshot,
    );
    expect(result.validCommands).toEqual([]);
    expect(result.rejectedCommands).toEqual([
      { index: 0, kind: 'rule.import', reason: 'type-not-found' },
      { index: 1, kind: 'rule.activate', reason: 'rule-not-found' },
      { index: 2, kind: 'rule.activate', reason: 'rule-not-found' },
    ]);
  });

  it('preserves command order and marks translated batches as AI sourced', () => {
    const commands = [
      { kind: 'task.setAiRank', taskId: 'task-1', rank: 1 },
      { kind: 'task.classify', taskId: 'task-1', disciplineId: 'discipline-1' },
    ] as const;
    expect(toStorageCommands(commands, snapshot)).toEqual({
      commands,
      source: 'ai',
    });
  });

  it('does not expose internal AI-only commands through renderer IPC', () => {
    expect(
      ipcCommandSchema.safeParse({
        kind: 'task.classify',
        taskId: 'task-1',
        typeId: 'type-1',
      }).success,
    ).toBe(false);
    expect(
      ipcCommandSchema.safeParse({ kind: 'rule.import', documentJson: '{}' })
        .success,
    ).toBe(false);
    expect(
      ipcCommandSchema.safeParse({ kind: 'rule.activate', ruleId: 'r1' })
        .success,
    ).toBe(false);
    expect(
      ipcCommandSchema.safeParse({
        kind: 'task.setAiRank',
        taskId: 'task-1',
        rank: 0,
      }).success,
    ).toBe(false);
  });

  it('validates an empty proposal without producing changes', () => {
    expect(validateProposal(proposal([]), snapshot)).toEqual({
      validCommands: [],
      rejectedCommands: [],
    });
    expect(
      validateProposal({ ...proposal([]), extra: true }, snapshot)
        .rejectedCommands[0]?.reason,
    ).toBe('invalid-proposal');
  });
});
