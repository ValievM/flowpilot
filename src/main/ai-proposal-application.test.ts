import { describe, expect, it } from 'vitest';
import { AiProposalApplication } from './ai-proposal-application';
import {
  aiTask,
  emptyReferences,
  proposal,
  seedTask,
  setup,
} from './ai-proposal-test-support';

describe('AI proposal application', () => {
  it('shows field-level changes and keeps confirm proposals unapplied until confirmation', () => {
    const { repository, application } = setup();
    seedTask(repository);
    const proposalValue = proposal('confirm-1', 1, [
      { kind: 'task.update', id: 'task-1', changes: { title: 'Final draft' } },
    ]);
    const historyBefore = repository.history(10).entries;

    const staged = application.applyProposal(proposalValue, 'confirm');

    expect(staged).toMatchObject({
      kind: 'confirmation-required',
      diff: {
        changes: [
          {
            entityId: 'task-1',
            field: 'title',
            before: 'Draft',
            after: 'Final draft',
          },
        ],
      },
    });
    expect(repository.load().tasks[0]?.title).toBe('Draft');
    expect(repository.load().revision).toBe(1);
    expect(repository.history(10).entries).toEqual(historyBefore);
    expect(application.rejectProposal('confirm-1')).toMatchObject({
      kind: 'rejected',
      error: { kind: 'Declined' },
    });
    expect(repository.load().tasks[0]?.title).toBe('Draft');
    expect(repository.history(10).entries).toEqual(historyBefore);
  });

  it('applies a confirmed proposal with AI history source', () => {
    const { repository, application } = setup();
    seedTask(repository);
    application.applyProposal(
      proposal('confirm-2', 1, [
        { kind: 'task.update', id: 'task-1', changes: { title: 'Confirmed' } },
      ]),
      'confirm',
    );

    expect(application.confirmProposal('confirm-2')).toMatchObject({
      kind: 'applied',
      revision: 2,
      replayed: false,
    });
    expect(repository.load().tasks[0]?.title).toBe('Confirmed');
    expect(repository.history(1).entries[0]?.source).toBe('ai');
  });

  it('applies auto proposals immediately and reports rejected commands', () => {
    const { repository, application } = setup();
    const result = application.applyProposal(
      proposal('auto-1', 0, [
        { kind: 'task.create', task: aiTask('created', 'New') },
        { kind: 'task.update', id: 'missing', changes: { title: 'Invalid' } },
      ]),
      'auto',
    );

    expect(result).toMatchObject({
      kind: 'applied',
      revision: 1,
      rejectedCommands: [{ kind: 'task.update', reason: 'task-not-found' }],
    });
    expect(repository.load().tasks.map(({ id }) => id)).toEqual(['created']);
    expect(repository.history(1).entries[0]?.source).toBe('ai');
  });

  it('returns StaleProposal without overwriting a newer manual edit', () => {
    const { repository, application } = setup();
    seedTask(repository);
    const oldProposal = proposal('stale-1', 1, [
      { kind: 'task.update', id: 'task-1', changes: { title: 'AI version' } },
    ]);
    repository.apply(
      [
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { title: 'Manual version' },
        },
      ],
      1,
    );

    expect(application.applyProposal(oldProposal, 'auto')).toMatchObject({
      kind: 'rejected',
      error: { kind: 'StaleProposal' },
    });
    expect(repository.load().tasks[0]?.title).toBe('Manual version');
    expect(repository.load().revision).toBe(2);
  });

  it('rejects rule commands and catalog references as a whole before writing', () => {
    const { repository, application } = setup();
    seedTask(repository);
    const before = repository.history(10).entries;
    const mixed = proposal('unsupported-rule', 1, [
      {
        kind: 'task.update',
        id: 'task-1',
        changes: { title: 'Must not apply' },
      },
      { kind: 'rule.activate', ruleId: 'rule-1' },
    ]);

    expect(application.applyProposal(mixed, 'auto')).toMatchObject({
      kind: 'rejected',
      error: { kind: 'NotPersistedYet', reason: 'not-persisted-yet' },
    });
    expect(repository.load().tasks[0]?.title).toBe('Draft');
    expect(repository.load().revision).toBe(1);
    expect(repository.history(10).entries).toEqual(before);
    expect(repository.appliedProposal('unsupported-rule')).toBeUndefined();
    const classify = proposal('unsupported-classify', 1, [
      { kind: 'task.classify', taskId: 'task-1', typeId: 'type-1' },
    ]);
    expect(application.applyProposal(classify, 'auto')).toMatchObject({
      kind: 'rejected',
      error: { kind: 'NotPersistedYet', reason: 'not-persisted-yet' },
    });
    expect(repository.load().revision).toBe(1);
    expect(repository.history(10).entries).toEqual(before);
  });

  it('rejects a task creation with an unsupported catalog reference as a whole', () => {
    const { repository, application } = setup();
    const result = application.applyProposal(
      proposal('unsupported-type', 0, [
        {
          kind: 'task.create',
          task: { ...aiTask('new', 'New'), typeId: 'type-1' },
        },
      ]),
      'auto',
    );
    expect(result).toMatchObject({
      kind: 'rejected',
      error: { kind: 'NotPersistedYet' },
    });
    expect(repository.load().tasks).toEqual([]);
    expect(repository.load().revision).toBe(0);
  });

  it('uses changed rule fingerprints to reject a proposal as stale', () => {
    const current = { ...emptyReferences, ruleVersions: { rule: 'v2' } };
    const { application } = setup(() => current);
    const staleProposal = {
      ...proposal('stale-rule', 0, []),
      ruleVersions: { rule: 'v1' },
    };
    expect(application.applyProposal(staleProposal, 'auto')).toMatchObject({
      kind: 'rejected',
      error: { kind: 'StaleProposal' },
    });
  });

  it('keeps an already built proposal unchanged when the stored mode changes', () => {
    let referenceReads = 0;
    const { repository } = setup(() => {
      referenceReads += 1;
      return emptyReferences;
    });
    const built = proposal('mode-switch', 0, []);
    const before = structuredClone(built);
    repository.apply(
      [{ kind: 'setting.set', key: 'aiMode', value: 'confirm' }],
      0,
    );

    expect(repository.getAiMode()).toBe('confirm');
    expect(built).toEqual(before);
    expect(referenceReads).toBe(0);
  });

  it('shows rejected commands in confirmation diffs and applies only valid commands', () => {
    const { repository, application } = setup();
    seedTask(repository);
    const staged = application.applyProposal(
      proposal('confirm-partial', 1, [
        { kind: 'task.update', id: 'task-1', changes: { title: 'Valid' } },
        { kind: 'task.update', id: 'missing', changes: { title: 'Invalid' } },
      ]),
      'confirm',
    );

    expect(staged).toMatchObject({
      kind: 'confirmation-required',
      diff: {
        changes: [{ field: 'title', before: 'Draft', after: 'Valid' }],
        rejectedCommands: [{ index: 1, reason: 'task-not-found' }],
      },
      rejectedCommands: [{ index: 1, reason: 'task-not-found' }],
    });
    expect(repository.load().tasks[0]?.title).toBe('Draft');
    expect(application.confirmProposal('confirm-partial')).toMatchObject({
      kind: 'applied',
      rejectedCommands: [{ index: 1, reason: 'task-not-found' }],
    });
    expect(repository.load().tasks[0]?.title).toBe('Valid');
  });

  it('rejects forged service fields while preserving a valid suggestion', () => {
    const { repository, application } = setup();
    seedTask(repository);
    const result = application.applyProposal(
      proposal('strict-1', 1, [
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { title: 'Forged', status: { kind: 'done' } },
        },
        { kind: 'task.update', id: 'task-1', changes: { title: 'Safe' } },
      ]),
      'auto',
    );

    expect(result).toMatchObject({
      kind: 'applied',
      rejectedCommands: [{ index: 0, reason: 'invalid-command' }],
    });
    expect(repository.load().tasks[0]?.title).toBe('Safe');
    expect(repository.load().tasks[0]?.status.kind).toBe('todo');
  });

  it('returns the stored result for a repeated proposal id without duplicating tasks', () => {
    const { repository, application } = setup();
    const value = proposal('replay-1', 0, [
      { kind: 'task.create', task: aiTask('once', 'Only once') },
    ]);
    const first = application.applyProposal(value, 'auto');
    const replay = new AiProposalApplication(
      repository,
      () => emptyReferences,
    ).applyProposal(value, 'auto');

    expect(first).toMatchObject({
      kind: 'applied',
      revision: 1,
      replayed: false,
    });
    expect(replay).toMatchObject({
      kind: 'applied',
      revision: 1,
      replayed: true,
    });
    expect(repository.load().tasks).toHaveLength(1);
    expect(repository.history(10).entries).toHaveLength(1);
  });
});
