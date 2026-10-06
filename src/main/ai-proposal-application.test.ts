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
  it('shows an existing rule document replacement in the confirmation diff', () => {
    const rule = {
      schema_version: 'v1',
      id: 'rule-1',
      title: 'Старая версия',
      scope: { task_type_ids: ['type-1'] },
      rules: [
        { id: 'priority', kind: 'priority', level: 'high', reason: 'Важно' },
      ],
    } as const;
    const taskType = { id: 'type-1', name: 'Тип' };
    const references = {
      ...emptyReferences,
      taskTypes: [taskType],
      rules: [rule],
    };
    const { repository, application } = setup(() => references);
    seedTask(repository);
    const seeded = repository.apply(
      [
        { kind: 'taskType.create', taskType },
        { kind: 'rule.import', documentJson: JSON.stringify(rule) },
        { kind: 'rule.activate', ruleId: rule.id },
      ],
      1,
    );
    expect(seeded.ok).toBe(true);
    const updatedRule = { ...rule, title: 'Новая версия' };
    const staged = application.applyProposal(
      proposal('rule-diff', 2, [
        { kind: 'rule.import', documentJson: JSON.stringify(updatedRule) },
        { kind: 'rule.activate', ruleId: rule.id },
      ]),
      'confirm',
    );
    if (staged.kind !== 'confirmation-required')
      throw new Error('Expected rule confirmation diff');
    const change = staged.diff.changes.find(
      ({ entityId, field }) => entityId === rule.id && field === 'document',
    );
    expect(change?.before).toMatchObject({ title: 'Старая версия' });
    expect(change?.after).toMatchObject({ title: 'Новая версия' });
    expect(repository.load().rules[0]?.activeDocument?.title).toBe(
      'Старая версия',
    );
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

  it('binds confirmation to the staged proposal snapshot', () => {
    const { repository, application } = setup();
    seedTask(repository);
    const command = {
      kind: 'task.update' as const,
      id: 'task-1',
      changes: { title: 'Shown' },
    };
    const commentCommand = {
      kind: 'comment.add' as const,
      taskId: 'task-1',
      comment: { id: 'comment-1', text: 'Shown comment' },
    };
    const staged = application.applyProposal(
      proposal('confirm-snapshot', 1, [command, commentCommand]),
      'confirm',
    );

    expect(staged).toMatchObject({
      kind: 'confirmation-required',
      diff: {
        changes: [
          {
            entityId: 'task-1',
            field: 'title',
            before: 'Draft',
            after: 'Shown',
          },
          {
            commandIndex: 1,
            entityId: 'task-1',
            field: 'comments',
            before: [],
            after: [{ id: 'comment-1', text: 'Shown comment' }],
          },
        ],
      },
    });
    command.changes.title = 'Not shown';
    commentCommand.comment.text = 'Not shown comment';
    expect(staged).toMatchObject({
      diff: {
        changes: [{}, { after: [{ id: 'comment-1', text: 'Shown comment' }] }],
      },
    });
    expect(application.confirmProposal('confirm-snapshot')).toMatchObject({
      kind: 'applied',
      revision: 2,
      replayed: false,
    });
    expect(repository.load()).toMatchObject({
      revision: 2,
      tasks: [
        {
          title: 'Shown',
          comments: [{ id: 'comment-1', text: 'Shown comment' }],
        },
      ],
    });
    expect(repository.history(1).entries[0]).toMatchObject({
      revision: 2,
      source: 'ai',
      entities: [
        {
          kind: 'task',
          id: 'task-1',
          after: {
            task: { title: 'Shown' },
            comments: [{ id: 'comment-1', text: 'Shown comment' }],
          },
        },
      ],
    });
  });

  it('shows each update against the state produced by earlier commands', () => {
    const { repository, application } = setup();
    seedTask(repository);
    const staged = application.applyProposal(
      proposal('confirm-sequence', 1, [
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { title: 'Intermediate' },
        },
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { title: 'Final' },
        },
      ]),
      'confirm',
    );

    expect(staged).toMatchObject({
      kind: 'confirmation-required',
      diff: {
        changes: [
          {
            commandIndex: 0,
            entityId: 'task-1',
            field: 'title',
            before: 'Draft',
            after: 'Intermediate',
          },
          {
            commandIndex: 1,
            entityId: 'task-1',
            field: 'title',
            before: 'Intermediate',
            after: 'Final',
          },
        ],
      },
    });
    expect(application.confirmProposal('confirm-sequence')).toMatchObject({
      kind: 'applied',
      revision: 2,
    });
    expect(repository.load().tasks[0]?.title).toBe('Final');
    const history = repository.history(1).entries[0];
    expect(history?.entities[0]?.after).toMatchObject({
      task: { title: 'Final' },
    });
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

  it('atomically persists catalog classification and rule imports from an AI proposal', () => {
    const rule = {
      schema_version: 'v1',
      id: 'rule-1',
      title: 'Исходное правило',
      scope: { task_type_ids: ['type-1'], discipline_ids: ['discipline-1'] },
      rules: [
        { id: 'priority', kind: 'priority', level: 'high', reason: 'Важно' },
      ],
    } as const;
    const taskType = { id: 'type-1', name: 'Тип' };
    const discipline = { id: 'discipline-1', name: 'Дисциплина' };
    const references = {
      ...emptyReferences,
      taskTypes: [taskType],
      disciplines: [discipline],
      rules: [rule],
    };
    const { repository, application } = setup(() => references);
    seedTask(repository);
    const seeded = repository.apply(
      [
        { kind: 'taskType.create', taskType },
        { kind: 'discipline.create', discipline },
        { kind: 'rule.import', documentJson: JSON.stringify(rule) },
        { kind: 'rule.activate', ruleId: 'rule-1' },
      ],
      1,
    );
    expect(seeded.ok).toBe(true);
    const updatedRule = { ...rule, title: 'Обновлённое правило' };
    const applied = application.applyProposal(
      proposal('persisted-rule', 2, [
        { kind: 'task.update', id: 'task-1', changes: { title: 'Updated' } },
        {
          kind: 'task.classify',
          taskId: 'task-1',
          typeId: 'type-1',
          disciplineId: 'discipline-1',
        },
        { kind: 'rule.import', documentJson: JSON.stringify(updatedRule) },
        { kind: 'rule.activate', ruleId: 'rule-1' },
      ]),
      'auto',
    );

    expect(applied).toMatchObject({ kind: 'applied', revision: 3 });
    expect(repository.load()).toMatchObject({
      tasks: [
        { title: 'Updated', typeId: 'type-1', disciplineId: 'discipline-1' },
      ],
      rules: [{ activeDocument: { title: 'Обновлённое правило' } }],
    });
    expect(repository.history(1).entries[0]?.source).toBe('ai');
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

  it('preserves rejected commands when replaying after reloading the repository', () => {
    const { repository, application, reopenRepository } = setup();
    const value = proposal('partial-replay', 0, [
      { kind: 'task.create', task: aiTask('once', 'Only once') },
      { kind: 'task.update', id: 'missing', changes: { title: 'Invalid' } },
    ]);
    const first = application.applyProposal(value, 'auto');
    const replay = new AiProposalApplication(
      repository,
      () => emptyReferences,
    ).applyProposal(value, 'auto');
    const reloadedRepository = reopenRepository();
    const reloadedReplay = new AiProposalApplication(
      reloadedRepository,
      () => emptyReferences,
    ).applyProposal(value, 'auto');

    expect(first).toMatchObject({
      kind: 'applied',
      revision: 1,
      replayed: false,
      rejectedCommands: [
        { index: 1, kind: 'task.update', reason: 'task-not-found' },
      ],
    });
    expect(replay).toEqual({
      kind: 'applied',
      revision: 1,
      replayed: true,
      rejectedCommands: [
        { index: 1, kind: 'task.update', reason: 'task-not-found' },
      ],
    });
    expect(reloadedReplay).toEqual(replay);
    expect(reloadedRepository.load().tasks.map(({ id }) => id)).toEqual([
      'once',
    ]);
    expect(reloadedRepository.load().revision).toBe(1);
    expect(reloadedRepository.history(10).entries).toHaveLength(1);
  });
});
