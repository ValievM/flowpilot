import type { Proposal } from '../../shared/ai-commands';
import type { AiProvider, AiRequest, ProviderResult } from './ai-provider';

export type FakeAiScenario =
  | 'success'
  | 'malformed'
  | 'extra-fields'
  | 'hallucinated-id'
  | 'timeout'
  | 'unavailable';

export interface FakeAiStep {
  readonly scenario: FakeAiScenario;
  readonly proposal?: Proposal;
  readonly reply?: unknown;
  readonly wait?: () => Promise<void>;
}

export class FakeAiProvider implements AiProvider {
  readonly calls: AiRequest[] = [];
  private stepIndex = 0;

  constructor(private readonly steps: readonly FakeAiStep[]) {}

  async ask(
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<ProviderResult<unknown>> {
    this.calls.push(request);
    const step = this.steps[this.stepIndex];
    this.stepIndex += 1;
    if (!step || signal.aborted || step.scenario === 'unavailable') {
      return { ok: false, error: { kind: 'ProviderUnavailable' } };
    }
    if (step.scenario === 'timeout') return waitForAbort(signal);
    if (step.scenario === 'malformed') {
      return { ok: false, error: { kind: 'InvalidReply' } };
    }
    await step.wait?.();
    return {
      ok: true,
      value: step.reply === undefined ? fakeReply(step) : step.reply,
    };
  }
}

function fakeReply(step: FakeAiStep): unknown {
  if (!step.proposal) return null;
  if (step.scenario === 'extra-fields')
    return { ...step.proposal, injected: true };
  if (step.scenario === 'hallucinated-id') {
    return {
      ...step.proposal,
      commands: [{ kind: 'task.setAiRank', taskId: 'missing-task', rank: 0 }],
    };
  }
  return step.proposal;
}

function waitForAbort(signal: AbortSignal): Promise<ProviderResult<unknown>> {
  if (signal.aborted) {
    return Promise.resolve({ ok: false, error: { kind: 'Aborted' } });
  }
  return new Promise((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve({ ok: false, error: { kind: 'Aborted' } });
      },
      { once: true },
    );
  });
}
