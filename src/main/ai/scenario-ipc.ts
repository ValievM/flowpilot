import {
  aiScenarioRequestSchema,
  type AiScenarioResult,
} from '../../shared/contracts';
import { toPlain } from '../../shared/to-plain';
import type { AiUseCases } from './usecases';

export async function runAiScenario(
  input: unknown,
  useCases: AiUseCases,
): Promise<AiScenarioResult> {
  const result = await runScenario(input, useCases);
  return result.ok ? { ok: true, value: toPlain(result.value) } : result;
}

async function runScenario(
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
    case 'cancel':
      useCases.cancel();
      return { ok: true, value: null };
    case 'reject':
      return { ok: true, value: useCases.reject(parsed.data.proposalId) };
  }
}
