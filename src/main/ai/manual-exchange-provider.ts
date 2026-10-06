import type { Proposal } from '../../shared/ai-commands';
import type { AiProvider, AiRequest, ProviderResult } from './ai-provider';
import { parseProviderText } from './provider-reply';

interface ManualSession {
  readonly prompt: string;
  readonly resolve: (result: ProviderResult<Proposal>) => void;
  readonly context: unknown;
  readonly referenceIndex: AiRequest['referenceIndex'];
  readonly signal: AbortSignal;
}

export class ManualExchangeProvider implements AiProvider {
  private readonly sessions = new Map<string, ManualSession>();

  ask(
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<ProviderResult<Proposal>> {
    if (signal.aborted || this.sessions.has(request.operationId)) {
      return Promise.resolve({ ok: false, error: { kind: 'Aborted' } });
    }
    let settle: ((result: ProviderResult<Proposal>) => void) | undefined;
    const promise = new Promise<ProviderResult<Proposal>>((resolve) => {
      settle = resolve;
    });
    const session = {
      prompt: formatManualRequest(request),
      resolve: (result: ProviderResult<Proposal>) => settle?.(result),
      signal,
      context: request.context,
      referenceIndex: request.referenceIndex,
    };
    this.sessions.set(request.operationId, session);
    signal.addEventListener(
      'abort',
      () => {
        this.sessions.delete(request.operationId);
        session.resolve({ ok: false, error: { kind: 'Aborted' } });
      },
      { once: true },
    );
    return promise;
  }

  getPrompt(operationId: string): string | undefined {
    return this.sessions.get(operationId)?.prompt;
  }

  provideReply(operationId: string, text: string): boolean {
    const session = this.sessions.get(operationId);
    if (!session || session.signal.aborted) return false;
    this.sessions.delete(operationId);
    session.resolve(
      parseProviderText(text, session.context, session.referenceIndex),
    );
    return true;
  }
}

function formatManualRequest(request: AiRequest): string {
  return [
    request.instruction,
    `Operation: ${request.operationId}`,
    'Context:',
    JSON.stringify(request.context, null, 2),
    'Required response schema:',
    JSON.stringify(request.responseSchema, null, 2),
  ].join('\n');
}
