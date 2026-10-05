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

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('AI IPC reference index', () => {
  it('replaces renderer task IDs with the full authoritative repository snapshot', async () => {
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
        referenceIndex: {
          columns: [{ id: 'todo', state: 'todo' }],
          taskTypeIds: [],
          disciplineIds: [],
          ruleIds: [],
          taskIds: [],
          subtaskIds: [],
          commentIds: [],
        },
        instruction: 'Return a proposal',
        responseSchema: { type: 'object' },
      },
      runner,
      repository.load(),
    );

    expect(result).toEqual({ ok: false, error: 'InvalidReply' });
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
        referenceIndex: {
          columns: [],
          taskTypeIds: [],
          disciplineIds: [],
          ruleIds: [],
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
    if (!result.ok) throw new Error('Expected the move proposal');
    const command = result.value.commands[0];
    if (command?.kind !== 'task.move' || command.status?.kind !== 'waiting')
      throw new Error('Expected a waiting move command');
    expect(command.status.until).toBe('2026-10-12');
    expect(command.status.until).not.toBeInstanceOf(Temporal.PlainDate);
    repository.close();
  });
});
