import { describe, expect, it, vi } from 'vitest';
import { createCodexProvider, parseCodexStatus } from './codex-exec-provider';
import { createSwitchableProvider } from './switchable-provider';
import type { AiProvider, AiRequest } from './ai-provider';

const request: AiRequest = {
  operationId: 'op-1',
  context: { tasks: [{ id: 'task-1' }] },
  referenceIndex: {
    columns: [],
    taskIds: [],
    taskTypeIds: [],
    disciplineIds: [],
    ruleIds: [],
    subtaskIds: [],
    commentIds: [],
  },
  instruction: 'Выбери следующее действие',
  responseSchema: { type: 'object' },
};

function provider(
  run: (input: { prompt: string; signal: AbortSignal }) => Promise<{
    code: number;
    lastMessage: string;
  }>,
  binary: string | undefined = '/opt/homebrew/bin/codex',
) {
  return createCodexProvider({ run, findBinary: () => binary });
}

describe('Codex exec provider', () => {
  it('asks Codex for JSON only and returns the parsed answer', async () => {
    const run = vi.fn(() =>
      Promise.resolve({
        code: 0,
        lastMessage: '{"action":null,"reason":"нет дел"}',
      }),
    );
    const result = await provider(run).ask(
      request,
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: true,
      value: { action: null, reason: 'нет дел' },
    });
    const prompt = (run.mock.calls[0] as unknown as [{ prompt: string }])[0]
      .prompt;
    expect(prompt).toContain('Выбери следующее действие');
    expect(prompt).toContain('task-1');
    expect(prompt).toMatch(/только JSON/i);
  });

  it('reads an answer that Codex wrapped in a code fence', async () => {
    const result = await provider(() =>
      Promise.resolve({ code: 0, lastMessage: '```json\n{"a":1}\n```' }),
    ).ask(request, new AbortController().signal);
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('treats text that is not JSON as an invalid reply', async () => {
    const result = await provider(() =>
      Promise.resolve({ code: 0, lastMessage: 'Конечно! Вот ответ.' }),
    ).ask(request, new AbortController().signal);
    expect(result).toEqual({ ok: false, error: { kind: 'InvalidReply' } });
  });

  it('reports the provider as unavailable when Codex fails or is not installed', async () => {
    const failed = await provider(() =>
      Promise.resolve({ code: 1, lastMessage: '' }),
    ).ask(request, new AbortController().signal);
    const missing = await provider(
      () => Promise.reject(new Error('should not run')),
      undefined,
    ).ask(request, new AbortController().signal);
    expect(failed).toEqual({
      ok: false,
      error: { kind: 'ProviderUnavailable' },
    });
    expect(missing).toEqual({
      ok: false,
      error: { kind: 'ProviderUnavailable' },
    });
  });

  it('passes the abort signal on and reports Aborted', async () => {
    const controller = new AbortController();
    const result = provider(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    ).ask(request, controller.signal);
    controller.abort();
    expect(await result).toEqual({ ok: false, error: { kind: 'Aborted' } });
  });
});

describe('Codex login status', () => {
  it('recognizes a ChatGPT login, no login and a missing binary', () => {
    expect(parseCodexStatus(0, 'Logged in using ChatGPT')).toEqual({
      installed: true,
      loggedIn: true,
    });
    expect(parseCodexStatus(1, 'Not logged in')).toEqual({
      installed: true,
      loggedIn: false,
    });
    expect(parseCodexStatus(undefined, '')).toEqual({
      installed: false,
      loggedIn: false,
    });
  });
});

describe('switchable provider', () => {
  const named = (name: string): AiProvider => ({
    ask: () => Promise.resolve({ ok: true, value: name }),
  });

  it('follows the current choice on every request', async () => {
    let choice: 'manual' | 'codex' = 'manual';
    const switchable = createSwitchableProvider({
      manual: named('manual'),
      codex: named('codex'),
      choice: () => choice,
    });
    const signal = new AbortController().signal;
    expect(await switchable.ask(request, signal)).toEqual({
      ok: true,
      value: 'manual',
    });
    choice = 'codex';
    expect(await switchable.ask(request, signal)).toEqual({
      ok: true,
      value: 'codex',
    });
  });
});
