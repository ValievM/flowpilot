import type {
  AiProvider,
  AiRequest,
  ProviderError,
  ProviderResult,
} from './ai-provider';

export type RunnerError = ProviderError | { readonly kind: 'AlreadyRunning' };
export type RunnerResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: RunnerError };

const DEFAULT_TIMEOUT_MS = 60_000;

export class AiRunner {
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly provider: AiProvider,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async run(request: AiRequest): Promise<RunnerResult> {
    if (this.active.has(request.operationId)) {
      return { ok: false, error: { kind: 'AlreadyRunning' } };
    }
    const controller = new AbortController();
    this.active.set(request.operationId, controller);
    try {
      return await this.withTimeout(request, controller);
    } finally {
      this.active.delete(request.operationId);
    }
  }

  cancelAll(): void {
    for (const controller of this.active.values()) controller.abort();
  }

  cancel(operationId: string): void {
    this.active.get(operationId)?.abort();
  }

  private async withTimeout(
    request: AiRequest,
    controller: AbortController,
  ): Promise<RunnerResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const timeoutResult = new Promise<RunnerResult>((resolve) => {
      timeout = setTimeout(() => {
        resolve({ ok: false, error: { kind: 'ProviderUnavailable' } });
        controller.abort();
      }, this.timeoutMs);
    });
    const abortResult = new Promise<RunnerResult>((resolve) => {
      onAbort = () => {
        resolve({ ok: false, error: { kind: 'Aborted' } });
      };
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const providerResult = Promise.resolve()
      .then(() => this.provider.ask(request, controller.signal))
      .then(mapProviderResult)
      .catch(providerUnavailable);
    try {
      return await Promise.race([providerResult, timeoutResult, abortResult]);
    } finally {
      clearTimeout(timeout);
      if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    }
  }
}

function mapProviderResult(result: ProviderResult<unknown>): RunnerResult {
  if (result.ok) return result;
  return { ok: false, error: result.error };
}

function providerUnavailable(): RunnerResult {
  return { ok: false, error: { kind: 'ProviderUnavailable' } };
}
