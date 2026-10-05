import type { AiProvider } from './ai-provider';
import type { RuntimeEnvironment } from '../runtime';

export type AiProviderChoice = 'manual' | 'fake';
export interface AiProviderSelection {
  readonly isPackaged: boolean;
  readonly environment: RuntimeEnvironment;
  readonly manualProvider: AiProvider;
  readonly fakeProvider: AiProvider;
  readonly choice?: AiProviderChoice;
}

export function selectAiProvider(selection: AiProviderSelection): AiProvider {
  const fakeEnabled =
    !selection.isPackaged && selection.environment.FLOWPILOT_TEST === '1';
  return selection.choice === 'fake' && fakeEnabled
    ? selection.fakeProvider
    : selection.manualProvider;
}
