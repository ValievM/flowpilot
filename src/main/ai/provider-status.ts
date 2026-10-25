import { z } from 'zod';
import type { Result } from '../../shared/ipc-result';
import type { AiProviderStatus } from '../../shared/ai-provider-contracts';
import type { Repository } from '../../storage';

const emptyRequest = z.object({}).strict();

export function currentChoice(
  repository: Repository | undefined,
): 'manual' | 'codex' {
  return repository?.load().settings.aiProvider === 'codex'
    ? 'codex'
    : 'manual';
}

/** Reports what is chosen and whether Codex can actually be used; asks Codex for nothing. */
export async function getAiProviderStatus(
  request: unknown,
  deps: {
    repository: Repository;
    checkCodex: () => Promise<{ installed: boolean; loggedIn: boolean }>;
  },
): Promise<Result<AiProviderStatus>> {
  if (!emptyRequest.safeParse(request).success)
    return { ok: false, error: 'ValidationFailed' };
  return {
    ok: true,
    value: {
      provider: currentChoice(deps.repository),
      codex: await deps.checkCodex(),
    },
  };
}

type CodexCheck = () => Promise<{ installed: boolean; loggedIn: boolean }>;

/** Tests must not depend on whether this computer has Codex: the answer is fixed there. */
export function codexCheckFor(
  isPackaged: boolean,
  environment: Readonly<Record<string, string | undefined>>,
  real: CodexCheck,
): CodexCheck {
  if (isPackaged || environment.FLOWPILOT_TEST !== '1') return real;
  const ready = environment.FLOWPILOT_TEST_CODEX === 'ready';
  return () => Promise.resolve({ installed: ready, loggedIn: ready });
}
