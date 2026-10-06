import type { Proposal } from '../../shared/ai-commands';
import type { AiProvider, AiRequest, ProviderResult } from './ai-provider';
import { validateProviderReply } from './provider-reply';

export type FakeAiScenario =
  | 'success'
  | 'malformed'
  | 'extra-fields'
  | 'hallucinated-id'
  | 'timeout'
  | 'unavailable';

export interface FakeAiStep {
  readonly scenario: FakeAiScenario;
  readonly proposal: Proposal;
  readonly wait?: () => Promise<void>;
}

export class FakeAiProvider implements AiProvider {
  readonly calls: AiRequest[] = [];
  private stepIndex = 0;

  constructor(private readonly steps: readonly FakeAiStep[]) {}

  async ask(
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<ProviderResult<Proposal>> {
    this.calls.push(request);
    const step = this.steps[this.stepIndex];
    this.stepIndex += 1;
    if (!step || signal.aborted || step.scenario === 'unavailable') {
      return { ok: false, error: { kind: 'ProviderUnavailable' } };
    }
    if (step.scenario === 'timeout') return waitForAbort(signal);
    await step.wait?.();
    return validateProviderReply(
      fakeReply(step),
      request.context,
      request.referenceIndex,
    );
  }
}

function fakeReply(step: FakeAiStep): unknown {
  if (step.scenario === 'malformed') return '{invalid';
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
function waitForAbort(signal: AbortSignal): Promise<ProviderResult<Proposal>> {
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
