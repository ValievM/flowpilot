import type { AiProvider } from './ai-provider';

export type AiProviderChoice = 'manual' | 'codex';

/** Reads the person's choice on every request, so switching in settings takes effect at once. */
export function createSwitchableProvider(input: {
  readonly manual: AiProvider;
  readonly codex: AiProvider;
  readonly choice: () => AiProviderChoice;
}): AiProvider {
  return {
    ask: (request, signal) =>
      (input.choice() === 'codex' ? input.codex : input.manual).ask(
        request,
        signal,
      ),
  };
}
