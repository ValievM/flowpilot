import {
  aiScenarioRequestSchema,
  type AiScenarioResult,
} from '../../shared/contracts';
import type { AiUseCases } from './usecases';

export async function runAiScenario(
  input: unknown,
  useCases: AiUseCases,
): Promise<AiScenarioResult> {
  const parsed = aiScenarioRequestSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { kind: 'ValidationFailed', message: 'Некорректный запрос AI.' },
    };
  switch (parsed.data.scenario) {
    case 'whatNow':
      return useCases.whatNow();
    case 'createFromText':
      return useCases.createFromText(parsed.data.text);
    case 'replan':
      return useCases.replan();
    case 'editRule':
      return useCases.editRule(parsed.data.instruction, parsed.data.document);
    case 'confirm':
      return { ok: true, value: useCases.confirm(parsed.data.proposalId) };
  }
}
