import { describe, expect, it } from 'vitest';
import { ManualExchangeProvider } from './manual-exchange-provider';
import { createStartupAiRunner } from './startup-ai-runner';

const request = {
  operationId: 'operation-1',
  context: {},
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

function runner(environment: Record<string, string>, isPackaged = false) {
  return createStartupAiRunner(
    isPackaged,
    environment,
    new ManualExchangeProvider(),
  );
}

const callsKey = '__FLOWPILOT_TEST_AI_CALLS__';

describe('provider call log for tests', () => {
  it('is exposed only in an unpackaged test build, and counts every provider call', async () => {
    Reflect.deleteProperty(globalThis, callsKey);
    runner({ FLOWPILOT_TEST: '1' }, true);
    expect(Reflect.has(globalThis, callsKey)).toBe(false);

    const test = runner({ FLOWPILOT_TEST: '1' });
    const calls = Reflect.get(globalThis, callsKey) as unknown[];
    expect(calls).toEqual([]);
    await test.run(request);
    expect(calls).toHaveLength(1);
    Reflect.deleteProperty(globalThis, callsKey);
  });
});

describe('startup AI runner scripted reply', () => {
  it('hands a scenario answer that is not a proposal to the use case unchanged', async () => {
    const answer = { action: null, reason: 'Нет доступных задач' };

    const result = await runner({
      FLOWPILOT_TEST: '1',
      FLOWPILOT_TEST_AI_REPLY: JSON.stringify(answer),
    }).run(request);

    expect(result).toEqual({ ok: true, value: answer });
  });

  it('ignores the scripted reply in a packaged application', async () => {
    const pending = runner(
      {
        FLOWPILOT_TEST: '1',
        FLOWPILOT_TEST_AI_REPLY: JSON.stringify({ reason: 'x' }),
      },
      true,
    ).run(request);
    const settled = await Promise.race([
      pending.then(() => 'answered'),
      new Promise((resolve) =>
        setTimeout(() => {
          resolve('waiting');
        }, 20),
      ),
    ]);

    expect(settled).toBe('waiting');
  });

  it('reports the provider as unavailable when the scripted reply is not JSON', async () => {
    const result = await runner({
      FLOWPILOT_TEST: '1',
      FLOWPILOT_TEST_AI_REPLY: 'not json',
    }).run(request);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'ProviderUnavailable' },
    });
  });
});
