import { describe, expect, it } from 'vitest';
import type { Proposal } from '../../shared/ai-commands';
import { validateProviderReply } from './provider-reply';

const proposal: Proposal = {
  id: 'proposal-1',
  baseRevision: 1,
  ruleVersions: {},
  commands: [],
  rationale: 'Use catalog references',
  unknowns: [],
  createdAt: '2026-10-05T12:00:00Z',
};
const context = {
  tasks: [{ id: 'task-1' }],
  columns: [{ id: 'todo' }],
  taskTypes: [{ id: 'type-1' }],
  disciplines: [{ id: 'discipline-1' }],
  rules: [{ id: 'rule-1' }],
};
const referenceIndex = {
  columns: [{ id: 'todo', state: 'todo' as const }],
  taskTypeIds: ['type-1'],
  disciplineIds: ['discipline-1'],
  ruleIds: ['rule-1'],
  taskIds: ['task-1'],
  subtaskIds: [],
  commentIds: [],
};
const ruleDocument = (typeId: string, disciplineId: string) =>
  JSON.stringify({
    schema_version: 'v1',
    id: 'imported-rule',
    title: 'Imported rule',
    scope: { task_type_ids: [typeId], discipline_ids: [disciplineId] },
    rules: [
      {
        id: 'priority',
        kind: 'priority',
        level: 'high',
        reason: 'Reason',
      },
    ],
  });

describe('provider catalog references', () => {
  it('accepts known classify and rule references and rejects unknown IDs', () => {
    const validCommands = [
      {
        kind: 'task.create',
        task: {
          id: 'created-task',
          title: 'Created task',
          columnId: 'todo',
          typeId: 'type-1',
          disciplineId: 'discipline-1',
          subtasks: [],
        },
      },
      {
        kind: 'task.classify',
        taskId: 'task-1',
        typeId: 'type-1',
        disciplineId: 'discipline-1',
      },
      { kind: 'rule.activate', ruleId: 'rule-1' },
      {
        kind: 'rule.import',
        documentJson: ruleDocument('type-1', 'discipline-1'),
      },
    ];
    expect(
      validateProviderReply(
        { ...proposal, commands: validCommands },
        context,
        referenceIndex,
      ),
    ).toEqual({
      ok: true,
      value: { ...proposal, commands: validCommands },
    });

    const invalidCommands = [
      {
        kind: 'task.create',
        task: {
          id: 'unclassified-task',
          title: 'Unknown discipline',
          columnId: 'todo',
          disciplineId: 'missing-discipline',
          subtasks: [],
        },
      },
      { kind: 'task.classify', taskId: 'task-1', typeId: 'missing-type' },
      {
        kind: 'task.classify',
        taskId: 'task-1',
        disciplineId: 'missing-discipline',
      },
      { kind: 'rule.activate', ruleId: 'missing-rule' },
      {
        kind: 'rule.import',
        documentJson: ruleDocument('missing-type', 'discipline-1'),
      },
      {
        kind: 'rule.import',
        documentJson: ruleDocument('type-1', 'missing-discipline'),
      },
    ];
    expect(
      invalidCommands.map((command) =>
        validateProviderReply(
          { ...proposal, commands: [command] },
          context,
          referenceIndex,
        ),
      ),
    ).toEqual(
      invalidCommands.map(() => ({
        ok: false,
        error: { kind: 'InvalidReply' },
      })),
    );
  });
});
