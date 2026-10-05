import { describe, expect, it } from 'vitest';
import type { Proposal } from '../../shared/ai-commands';
import { FakeAiProvider, type FakeAiScenario } from './fake-ai-provider';
import { ManualExchangeProvider } from './manual-exchange-provider';
import { AiRunner } from './ai-runner';
import { selectAiProvider } from './provider-selection';
import { validateProviderReply } from './provider-reply';

const proposal: Proposal = {
  id: 'proposal-1',
  baseRevision: 1,
  ruleVersions: {},
  commands: [{ kind: 'task.setAiRank', taskId: 'task-1', rank: 1 }],
  rationale: 'Move important work first',
  unknowns: [],
  createdAt: '2026-10-05T12:00:00Z',
};
const request = {
  operationId: 'operation-1',
  context: { tasks: [{ id: 'task-1' }] },
  instruction: 'Return a proposal',
  responseSchema: { type: 'object' },
};

function fake(scenario: FakeAiScenario) {
  return new FakeAiProvider([{ scenario, proposal }]);
}

describe('AI provider contract', () => {
  it('returns a valid proposal only after an explicit ask', async () => {
    const provider = fake('success');
    expect(provider.calls).toEqual([]);

    const result = await provider.ask(request, new AbortController().signal);

    expect(result).toEqual({ ok: true, value: proposal });
    expect(provider.calls).toEqual([request]);
  });

  it.each(['malformed', 'extra-fields', 'hallucinated-id'] as const)(
    'rejects the fake %s reply as InvalidReply',
    async (scenario) => {
      const result = await fake(scenario).ask(
        request,
        new AbortController().signal,
      );
      expect(result).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
    },
  );

  it('formats context and strict schema for manual exchange and validates pasted replies', async () => {
    const provider = new ManualExchangeProvider();
    const controller = new AbortController();
    const waiting = provider.ask(request, controller.signal);
    await Promise.resolve();
    const prompt = provider.getPrompt('operation-1');

    expect(prompt).toContain(JSON.stringify(request.context, null, 2));
    expect(prompt).toContain(JSON.stringify(request.responseSchema, null, 2));
    expect(provider.provideReply('operation-1', JSON.stringify(proposal))).toBe(
      true,
    );
    expect(await waiting).toEqual({ ok: true, value: proposal });
  });

  it('rejects malformed pasted replies through the same reply validator', async () => {
    const provider = new ManualExchangeProvider();
    const waiting = provider.ask(request, new AbortController().signal);
    await Promise.resolve();
    provider.provideReply('operation-1', '{bad json');
    expect(await waiting).toEqual({
      ok: false,
      error: { kind: 'InvalidReply' },
    });
  });

  it('times out and frees the runner for the next operation', async () => {
    const provider = new FakeAiProvider([
      { scenario: 'timeout', proposal },
      { scenario: 'success', proposal },
    ]);
    const runner = new AiRunner(provider, 5);
    expect(await runner.run(request)).toEqual({
      ok: false,
      error: { kind: 'ProviderUnavailable' },
    });
    expect(await runner.run(request)).toEqual({ ok: true, value: proposal });
  });

  it('rejects duplicate in-flight keys without calling provider twice', async () => {
    let release: (() => void) | undefined;
    const provider = new FakeAiProvider([
      {
        scenario: 'success',
        proposal,
        wait: () => new Promise<void>((resolve) => (release = resolve)),
      },
    ]);
    const runner = new AiRunner(provider, 1000);
    const first = runner.run(request);
    await Promise.resolve();

    expect(await runner.run(request)).toEqual({
      ok: false,
      error: { kind: 'AlreadyRunning' },
    });
    release?.();
    expect(await first).toEqual({ ok: true, value: proposal });
    expect(provider.calls).toHaveLength(1);
  });

  it('cancels provider work and ignores a reply arriving after cancellation', async () => {
    let release: (() => void) | undefined;
    const provider = new FakeAiProvider([
      {
        scenario: 'success',
        proposal,
        wait: () => new Promise<void>((resolve) => (release = resolve)),
      },
      { scenario: 'success', proposal },
    ]);
    const runner = new AiRunner(provider, 1000);
    const pending = runner.run(request);
    await Promise.resolve();
    runner.cancel('operation-1');

    expect(await pending).toEqual({
      ok: false,
      error: { kind: 'Aborted' },
    });
    release?.();
    expect(provider.calls).toHaveLength(1);
    expect(await runner.run(request)).toEqual({ ok: true, value: proposal });
  });

  it('returns ProviderUnavailable as a value without throwing', async () => {
    const result = await fake('unavailable').ask(
      request,
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: 'ProviderUnavailable' },
    });
  });

  it('only selects fake for explicitly enabled unpackaged test builds', () => {
    const manualProvider = fake('success');
    const fakeProvider = fake('unavailable');
    const selection = { manualProvider, fakeProvider };
    expect(
      selectAiProvider({
        ...selection,
        isPackaged: false,
        environment: { FLOWPILOT_TEST: '1' },
      }),
    ).toBe(fakeProvider);
    expect(
      selectAiProvider({
        ...selection,
        isPackaged: true,
        environment: { FLOWPILOT_TEST: '1' },
      }),
    ).toBe(manualProvider);
    expect(
      selectAiProvider({
        ...selection,
        isPackaged: false,
        environment: {},
      }),
    ).toBe(manualProvider);
  });

  it('rejects task references not present in request context', () => {
    expect(
      validateProviderReply(
        {
          ...proposal,
          commands: [
            { kind: 'task.setAiRank', taskId: 'missing-task', rank: 0 },
          ],
        },
        request.context,
      ),
    ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
  });
  it('accepts references to earlier created tasks and rejects duplicate IDs', () => {
    const createdTask = {
      id: 'created-task',
      title: 'Created task',
      columnId: 'todo',
      subtasks: [],
    };
    const commands = [
      { kind: 'task.create', task: createdTask },
      {
        kind: 'task.update',
        id: 'created-task',
        changes: { title: 'Updated' },
      },
      { kind: 'task.setAiRank', taskId: 'created-task', rank: 1 },
    ];
    expect(
      validateProviderReply({ ...proposal, commands }, request.context),
    ).toEqual({ ok: true, value: { ...proposal, commands } });

    expect(
      validateProviderReply(
        {
          ...proposal,
          commands: [
            { kind: 'task.create', task: { ...createdTask, id: 'task-1' } },
          ],
        },
        request.context,
      ),
    ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
    expect(
      validateProviderReply(
        {
          ...proposal,
          commands: [
            { kind: 'task.create', task: createdTask },
            { kind: 'task.create', task: createdTask },
          ],
        },
        request.context,
      ),
    ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
  });
  it('rejects commands excluded from the AI contract', () => {
    expect(
      validateProviderReply(
        { ...proposal, commands: [{ kind: 'task.delete', taskId: 'task-1' }] },
        request.context,
      ),
    ).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
  });
});
