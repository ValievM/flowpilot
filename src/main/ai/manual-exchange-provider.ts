import type { AiProvider, AiRequest, ProviderResult } from './ai-provider';

interface ManualSession {
  readonly prompt: string;
  readonly resolve: (result: ProviderResult<unknown>) => void;
  readonly signal: AbortSignal;
}

const MAX_REPLY_BYTES = 1024 * 1024;

export class ManualExchangeProvider implements AiProvider {
  private readonly sessions = new Map<string, ManualSession>();

  ask(
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<ProviderResult<unknown>> {
    if (signal.aborted || this.sessions.has(request.operationId)) {
      return Promise.resolve({ ok: false, error: { kind: 'Aborted' } });
    }
    let settle: ((result: ProviderResult<unknown>) => void) | undefined;
    const promise = new Promise<ProviderResult<unknown>>((resolve) => {
      settle = resolve;
    });
    const session = {
      prompt: formatManualRequest(request),
      resolve: (result: ProviderResult<unknown>) => settle?.(result),
      signal,
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
    session.resolve(parseRawReply(text));
    return true;
  }
}

function parseRawReply(text: string): ProviderResult<unknown> {
  if (new TextEncoder().encode(text).byteLength > MAX_REPLY_BYTES) {
    return { ok: false, error: { kind: 'InvalidReply' } };
  }
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false, error: { kind: 'InvalidReply' } };
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
