import { Temporal } from 'temporal-polyfill';
import { describe, expect, it, vi } from 'vitest';
import { listManualExchanges } from './ipc';
import { ManualExchangeProvider } from './manual-exchange-provider';
import { runAiScenario } from './scenario-ipc';
import type { AiUseCases } from './usecases';

function fakeUseCases(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    whatNow: vi.fn(),
    createFromText: vi.fn(),
    replan: vi.fn(),
    editRule: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    reject: vi.fn(() => ({
      kind: 'rejected',
      error: { kind: 'Declined', message: 'Предложение отклонено.' },
    })),
    ...overrides,
  } as unknown as AiUseCases;
}

describe('AI scenario IPC', () => {
  it('declines a pending proposal without touching data', async () => {
    const useCases = fakeUseCases();

    const result = await runAiScenario(
      { scenario: 'reject', proposalId: 'proposal-1' },
      useCases,
    );

    expect(useCases.reject).toHaveBeenCalledWith('proposal-1');
    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'rejected',
        error: { kind: 'Declined', message: 'Предложение отклонено.' },
      },
    });
  });

  it('sends only plain data over IPC: Temporal values become strings', async () => {
    const useCases = fakeUseCases({
      createFromText: vi.fn(() =>
        Promise.resolve({
          ok: true,
          value: {
            kind: 'confirmation-required',
            proposalId: 'proposal-2',
            diff: {
              changes: [
                {
                  commandIndex: 0,
                  entityId: 'task-1',
                  field: 'day',
                  before: null,
                  after: Temporal.PlainDate.from('2026-10-06'),
                },
              ],
              rejectedCommands: [],
            },
            rejectedCommands: [],
          },
        }),
      ),
    });

    const result = await runAiScenario(
      { scenario: 'createFromText', text: 'Купить книгу завтра' },
      useCases,
    );

    expect(result).toMatchObject({
      ok: true,
      value: { diff: { changes: [{ after: '2026-10-06' }] } },
    });
  });

  it('cancels whatever the AI is running right now', async () => {
    const useCases = fakeUseCases();

    const result = await runAiScenario({ scenario: 'cancel' }, useCases);

    expect(useCases.cancel).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, value: null });
  });

  it('rejects a malformed request without calling any use case', async () => {
    const useCases = fakeUseCases();

    const result = await runAiScenario({ scenario: 'reject' }, useCases);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'ValidationFailed' },
    });
    expect(useCases.reject).not.toHaveBeenCalled();
  });
});

describe('manual exchange listing', () => {
  const request = {
    operationId: 'operation-1',
    context: { tasks: [] },
    referenceIndex: {
      columns: [],
      taskIds: [],
      taskTypeIds: [],
      disciplineIds: [],
      ruleIds: [],
      subtaskIds: [],
      commentIds: [],
    },
    instruction: 'Ответь JSON',
    responseSchema: {},
  };

  it('lists the waiting request with its prompt and forgets it after a reply', () => {
    const provider = new ManualExchangeProvider();
    void provider.ask(request, new AbortController().signal);

    const waiting = listManualExchanges(provider);
    expect(waiting.ok).toBe(true);
    if (waiting.ok) {
      expect(waiting.value).toHaveLength(1);
      expect(waiting.value[0]?.operationId).toBe('operation-1');
      expect(waiting.value[0]?.prompt).toContain('Ответь JSON');
    }

    provider.provideReply('operation-1', '{}');
    const afterReply = listManualExchanges(provider);
    expect(afterReply).toEqual({ ok: true, value: [] });
  });

  it('forgets a request that was cancelled', () => {
    const provider = new ManualExchangeProvider();
    const controller = new AbortController();
    void provider.ask(request, controller.signal);
    controller.abort();

    expect(listManualExchanges(provider)).toEqual({ ok: true, value: [] });
  });
});
