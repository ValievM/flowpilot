import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../../storage';
import type { Proposal } from '../../shared/ai-commands';
import { runAiRequest } from './ipc';
import { AiRunner } from './ai-runner';
import { FakeAiProvider } from './fake-ai-provider';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T09:00:00Z') };

const unprovenCatalogCommands: Proposal['commands'] = [
  {
    kind: 'task.create',
    task: {
      id: 'new-task',
      title: 'Task with unproven type',
      columnId: 'todo',
      typeId: 'forged-type',
      subtasks: [],
    },
  },
  {
    kind: 'task.create',
    task: {
      id: 'new-task',
      title: 'Task with unproven discipline',
      columnId: 'todo',
      disciplineId: 'forged-discipline',
      subtasks: [],
    },
  },
  { kind: 'task.classify', taskId: 'task-1', typeId: 'forged-type' },
  { kind: 'rule.activate', ruleId: 'forged-rule' },
  {
    kind: 'rule.import',
    documentJson: JSON.stringify({
      schema_version: 'v1',
      id: 'forged-rule',
      title: 'Rule',
      scope: {
        task_type_ids: ['forged-type'],
        discipline_ids: ['forged-discipline'],
      },
      rules: [
        {
          id: 'priority',
          kind: 'priority',
          level: 'high',
          reason: 'Reason',
        },
      ],
    }),
  },
];

function seedTask(repository: Repository): number {
  const snapshot = repository.load();
  const created = repository.apply(
    [
      {
        kind: 'task.create',
        task: {
          id: 'task-1',
          title: 'Task',
          status: { kind: 'todo' },
          columnId: 'todo',
          subtasks: [],
          comments: [],
          attachments: [],
          addedOrder: 1,
        },
      },
    ],
    snapshot.revision,
  );
  if (!created.ok) throw new Error('Expected the fixture task to be created');
  return created.value.revision;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('AI IPC reference index', () => {
  it('builds task references from the full authoritative repository snapshot', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ai-index-'));
    directories.push(directory);
    const repository = new Repository(join(directory, 'flowpilot.db'), clock);
    const snapshot = repository.load();
    const created = repository.apply(
      [
        {
          kind: 'task.create',
          task: {
            id: 'completed-hidden-task',
            title: 'Completed task',
            status: { kind: 'done' },
            columnId: 'done',
            subtasks: [
              { id: 'hidden-subtask', title: 'Part', completed: false },
            ],
            comments: [{ id: 'hidden-comment', text: 'Comment' }],
            attachments: [],
            addedOrder: 1,
          },
        },
      ],
      snapshot.revision,
    );
    expect(created.ok).toBe(true);
    const proposal = {
      id: 'collision-proposal',
      baseRevision: created.ok ? created.value.revision : snapshot.revision,
      ruleVersions: {},
      commands: [
        {
          kind: 'task.create',
          task: {
            id: 'completed-hidden-task',
            title: 'Duplicate completed task',
            columnId: 'todo',
            subtasks: [],
          },
        },
      ],
      rationale: 'Create a task',
      unknowns: [],
      createdAt: '2026-10-06T09:00:00Z',
    } satisfies Proposal;
    const runner = new AiRunner(
      new FakeAiProvider([{ scenario: 'success', proposal }]),
    );

    const result = await runAiRequest(
      {
        operationId: 'hidden-index-check',
        context: { tasks: [] },
        instruction: 'Return a proposal',
        responseSchema: { type: 'object' },
      },
      runner,
      repository.load(),
    );

    expect(result).toEqual({ ok: false, error: 'InvalidReply' });
    repository.close();
  });
  it('rejects client-supplied reference indexes at the IPC boundary', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ai-forged-index-'));
    directories.push(directory);
    const repository = new Repository(join(directory, 'flowpilot.db'), clock);
    const proposal: Proposal = {
      id: 'forged-index-proposal',
      baseRevision: 0,
      ruleVersions: {},
      commands: [],
      rationale: 'No commands',
      unknowns: [],
      createdAt: '2026-10-06T09:00:00Z',
    };
    const result = await runAiRequest(
      {
        operationId: 'forged-index-check',
        context: { tasks: [] },
        referenceIndex: {
          columns: [],
          taskTypeIds: ['forged-type'],
          disciplineIds: ['forged-discipline'],
          ruleIds: ['forged-rule'],
          taskIds: [],
          subtaskIds: [],
          commentIds: [],
        },
        instruction: 'Return a proposal',
        responseSchema: { type: 'object' },
      },
      new AiRunner(new FakeAiProvider([{ scenario: 'success', proposal }])),
      repository.load(),
    );
    expect(result).toEqual({ ok: false, error: 'ValidationFailed' });
    repository.close();
  });

  it('fails closed on catalog references until #40 provides authoritative catalogs', async () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'flowpilot-ai-missing-catalog-'),
    );
    directories.push(directory);
    const repository = new Repository(join(directory, 'flowpilot.db'), clock);
    const baseRevision = seedTask(repository);
    for (const [index, command] of unprovenCatalogCommands.entries()) {
      const proposal: Proposal = {
        id: `unproven-catalog-${String(index)}`,
        baseRevision,
        ruleVersions: {},
        commands: [command],
        rationale: 'Use a catalog reference',
        unknowns: [],
        createdAt: '2026-10-06T09:00:00Z',
      };
      const result = await runAiRequest(
        {
          operationId: `unproven-catalog-${String(index)}`,
          context: { tasks: [{ id: 'task-1' }] },
          instruction: 'Return a proposal',
          responseSchema: { type: 'object' },
        },
        new AiRunner(new FakeAiProvider([{ scenario: 'success', proposal }])),
        repository.load(),
      );
      expect(result).toEqual({ ok: false, error: 'InvalidReply' });
    }
    repository.close();
  });
  it('serializes Temporal task.move waiting dates to the IPC wire format', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-ai-move-wire-'));
    directories.push(directory);
    const repository = new Repository(join(directory, 'flowpilot.db'), clock);
    const snapshot = repository.load();
    const created = repository.apply(
      [
        {
          kind: 'task.create',
          task: {
            id: 'task-1',
            title: 'Task',
            status: { kind: 'todo' },
            columnId: 'todo',
            subtasks: [],
            comments: [],
            attachments: [],
            addedOrder: 1,
          },
        },
      ],
      snapshot.revision,
    );
    expect(created.ok).toBe(true);
    const proposal = {
      id: 'move-proposal',
      baseRevision: 1,
      ruleVersions: {},
      commands: [
        {
          kind: 'task.move',
          id: 'task-1',
          columnId: 'waiting',
          status: {
            kind: 'waiting',
            reason: 'Blocked',
            until: Temporal.PlainDate.from('2026-10-12'),
          },
        },
      ],
      rationale: 'Move to waiting',
      unknowns: [],
      createdAt: '2026-10-06T09:00:00Z',
    } satisfies Proposal;
    const result = await runAiRequest(
      {
        operationId: 'move-wire-check',
        context: { tasks: [{ id: 'task-1' }] },
        instruction: 'Return a proposal',
        responseSchema: { type: 'object' },
      },
      new AiRunner(new FakeAiProvider([{ scenario: 'success', proposal }])),
      repository.load(),
    );
    if (!result.ok) throw new Error('Expected the move proposal');
    const command = result.value.commands[0];
    if (command?.kind !== 'task.move' || command.status?.kind !== 'waiting')
      throw new Error('Expected a waiting move command');
    expect(command.status.until).toBe('2026-10-12');
    expect(command.status.until).not.toBeInstanceOf(Temporal.PlainDate);
    repository.close();
  });
});
