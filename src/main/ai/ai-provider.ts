import type { AiReferenceIndex } from '../../shared/ai-reference-index';
import type { Proposal } from '../../shared/ai-commands';

export interface AiRequest {
  readonly operationId: string;
  readonly context: unknown;
  readonly referenceIndex: AiReferenceIndex;
  readonly instruction: string;
  readonly responseSchema: Readonly<Record<string, unknown>>;
}
export type ProviderError =
  | { readonly kind: 'InvalidReply' }
  | { readonly kind: 'ProviderUnavailable' }
  | { readonly kind: 'Aborted' };

export type ProviderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProviderError };

export interface AiProvider {
  ask(
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<ProviderResult<Proposal>>;
}
