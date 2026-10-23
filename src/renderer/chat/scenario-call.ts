import type { AiScenarioResult } from '../../shared/contracts';

export async function callScenario(
  scenario: Parameters<typeof window.flowpilot.ai.scenario>[0],
): Promise<AiScenarioResult> {
  try {
    return await window.flowpilot.ai.scenario(scenario);
  } catch {
    return { ok: false, error: { kind: 'ProviderUnavailable', message: '' } };
  }
}
