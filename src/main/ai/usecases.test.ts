import { Temporal } from 'temporal-polyfill';
import { buildContext } from '../../domain';
import { createAiReferenceIndex } from '../../shared/ai-reference-index';
import type { Proposal } from '../../shared/ai-commands';
import { AiRunner } from './ai-runner';
import { FakeAiProvider } from './fake-ai-provider';
import { AiUseCases } from './usecases';
import { emptyReferences, seedTask, setup } from '../ai-proposal-test-support';
import { createAiUseCases } from './usecases/startup';
import type { Series } from '../../domain';
import { describe, expect, it } from 'vitest';

const now = Temporal.Instant.from('2026-10-06T12:00:00Z').toZonedDateTimeISO(
  'Europe/Moscow',
);
const emptyProposal: Proposal = {
  id: 'unused',
  baseRevision: 0,
  ruleVersions: {},
  commands: [],
  rationale: 'unused',
  unknowns: [],
  createdAt: '2026-10-06T12:00:00Z',
};

describe('explicit AI use cases', () => {
  it('answers what-now without changing the database', async () => {
    const { repository, application } = setup();
    const before = repository.load();
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: { action: null, reason: 'Нет доступных дел.' },
      },
    ]);

    const result = await useCases.whatNow();

    expect(result).toEqual({
      ok: true,
      value: { kind: 'no-available-tasks', reason: 'Нет доступных дел.' },
    });
    expect(repository.load()).toEqual(before);
  });

  it('recommends an available risky task without applying changes', async () => {
    const { repository, application } = setup();
    seedTask(repository);
    repository.apply(
      [
        {
          kind: 'task.update',
          id: 'task-1',
          changes: {
            day: now.toPlainDate(),
            deadline: now.toPlainDate(),
            estimate: { unit: 'workdays', value: 1 },
          },
        },
      ],
      repository.load().revision,
    );
    const before = repository.load();
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: {
          action: { taskId: 'task-1' },
          reason: 'Срок сегодня, риск высокий.',
        },
      },
    ]);

    expect(await useCases.whatNow()).toEqual({
      ok: true,
      value: {
        kind: 'recommendation',
        answer: {
          action: { taskId: 'task-1' },
          reason: 'Срок сегодня, риск высокий.',
        },
      },
    });
    expect(repository.load()).toEqual(before);
  });

  it('includes missed recurring instances in the what-now provider context', async () => {
    const { repository } = setup();
    const series: Series = {
      id: 'training',
      title: 'Тренировка',
      weekdays: [1],
      time: Temporal.PlainTime.from('18:00'),
      startsOn: Temporal.PlainDate.from('2026-10-05'),
    };
    repository.apply([{ kind: 'series.create', series }], 0);
    const provider = new FakeAiProvider([
      {
        scenario: 'success',
        reply: { action: null, reason: 'Нет доступных дел.' },
      },
    ]);
    const useCases = createAiUseCases(repository, new AiRunner(provider), {
      now: () => now.toInstant(),
    });

    await useCases.whatNow();

    expect(provider.calls[0]?.context).toMatchObject({
      context: {
        missedRepeats: [
          {
            seriesId: 'training',
            count: 1,
            dates: ['2026-10-05'],
          },
        ],
      },
    });
  });

  it('rejects a what-now answer that references another task', async () => {
    const { repository, application } = setup();
    seedTask(repository);
    const before = repository.load();
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: { action: { taskId: 'other-task' }, reason: 'Do this now.' },
      },
    ]);

    expect(await useCases.whatNow()).toMatchObject({
      ok: false,
      error: { kind: 'InvalidReply' },
    });
    expect(repository.load()).toEqual(before);
  });

  it('rejects a replan answer that references an unknown column', async () => {
    const { repository, application } = setup();
    seedTask(repository);
    const before = repository.load();
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: {
          commands: [{ kind: 'task.move', id: 'task-1', columnId: 'missing' }],
          rationale: 'Move the task.',
        },
      },
    ]);

    expect(await useCases.replan()).toMatchObject({
      ok: false,
      error: { kind: 'InvalidReply' },
    });
    expect(repository.load()).toEqual(before);
  });
  it('creates cards in auto mode and replays identical text without duplicates', async () => {
    const { repository, application } = setup();
    const reply = {
      cards: [
        {
          title: 'Подготовить лабораторную',
          subtasks: [{ title: 'Проверить условие' }],
        },
      ],
      unknowns: ['Срок не указан.'],
    };
    const useCases = createUseCases(repository, application, [
      { scenario: 'success', proposal: emptyProposal, reply },
      { scenario: 'success', proposal: emptyProposal, reply },
    ]);

    const first = await useCases.createFromText('Подготовить лабораторную');
    const replay = await useCases.createFromText('Подготовить лабораторную');

    expect(first).toMatchObject({ ok: true, value: { kind: 'applied' } });
    expect(replay).toMatchObject({
      ok: true,
      value: { kind: 'applied', replayed: true },
    });
    expect(repository.load().tasks).toHaveLength(1);
    expect(repository.load().tasks[0]?.deadline).toBeUndefined();
    expect(repository.load().tasks[0]?.subtasks).toEqual([
      expect.objectContaining({ title: 'Проверить условие', completed: false }),
    ]);
  });

  it('holds a create proposal in confirm mode until confirmation', async () => {
    const { repository, application } = setup();
    repository.apply(
      [{ kind: 'setting.set', key: 'aiMode', value: 'confirm' }],
      0,
    );
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: {
          cards: [{ title: 'Новая карточка', subtasks: [] }],
          unknowns: [],
        },
      },
    ]);

    const staged = await useCases.createFromText('Новая карточка');

    expect(staged).toMatchObject({
      ok: true,
      value: { kind: 'confirmation-required' },
    });
    expect(repository.load().tasks).toHaveLength(0);
    if (!staged.ok || staged.value.kind !== 'confirmation-required') return;
    expect(useCases.confirm(staged.value.proposalId)).toMatchObject({
      kind: 'applied',
    });
    expect(repository.load().tasks).toHaveLength(1);
  });

  it('creates and activates a validated rule through the shared application path', async () => {
    const { repository, application } = setup();
    seedTask(repository);
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: {
          taskId: 'task-1',
          document: {
            schema_version: 'v1',
            id: 'ai-rule',
            title: 'Правило для задачи',
            scope: { task_type_ids: [] },
            rules: [
              {
                id: 'priority',
                kind: 'priority',
                level: 'high',
                reason: 'Сначала важное.',
              },
            ],
          },
        },
      },
    ]);

    expect(
      await useCases.editRule('Поставь приоритет выше.', {}),
    ).toMatchObject({
      ok: true,
      value: { kind: 'applied' },
    });
    expect(repository.load().rules).toEqual([
      expect.objectContaining({ id: 'ai-rule', status: 'active' }),
    ]);
  });

  it('rejects a malformed scenario answer without changing the database', async () => {
    const { repository, application } = setup();
    const before = repository.load();
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: { cards: 'not-an-array' },
      },
    ]);

    const result = await useCases.createFromText('Создай карточку');

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'InvalidReply' },
    });
    expect(repository.load()).toEqual(before);
  });

  it('rejects a replan made stale during the provider request', async () => {
    const { repository, application } = setup();
    seedTask(repository);
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => (release = resolve));
    const useCases = createUseCases(repository, application, [
      {
        scenario: 'success',
        proposal: emptyProposal,
        reply: {
          commands: [{ kind: 'task.move', id: 'task-1', columnId: 'todo' }],
          rationale: 'Keep the task available.',
        },
        wait: () => waiting,
      },
    ]);

    const pending = useCases.replan();
    await Promise.resolve();
    repository.apply(
      [
        {
          kind: 'task.update',
          id: 'task-1',
          changes: { title: 'Fresh title' },
        },
      ],
      repository.load().revision,
    );
    release?.();

    expect(await pending).toMatchObject({
      ok: false,
      error: { kind: 'StaleProposal' },
    });
    expect(repository.load().tasks[0]?.title).toBe('Fresh title');
  });
});

function createUseCases(
  repository: ReturnType<typeof setup>['repository'],
  application: ReturnType<typeof setup>['application'],
  steps: ConstructorParameters<typeof FakeAiProvider>[0],
): AiUseCases {
  const provider = new FakeAiProvider(steps);
  return new AiUseCases({
    runner: new AiRunner(provider),
    application,
    repository,
    getContext: (snapshot) =>
      buildContext({
        today: now.toPlainDate(),
        now,
        tasks: snapshot.tasks,
        series: [],
        outcomes: [],
        activeRules: [],
        taskTypes: snapshot.taskTypes,
        disciplines: snapshot.disciplines,
        workdays: new Set([1, 2, 3, 4, 5]),
        columns: snapshot.columns,
      }),
    getReferenceIndex: (snapshot) => createAiReferenceIndex(snapshot),
    getReferenceData: () => emptyReferences,
    clock: { now: () => now.toInstant() },
  });
}
