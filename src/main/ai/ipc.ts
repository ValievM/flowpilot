import {
  aiCancelRequestSchema,
  aiReplyRequestSchema,
  aiRequestSchema,
  type AiCancelResult,
  type AiIpcResult,
  type AiManualReplyResult,
} from '../../shared/contracts';
import type { Result } from '../../shared/ipc-result';
import type { AiRunner } from './ai-runner';
import type { ManualExchangeProvider } from './manual-exchange-provider';

export async function runAiRequest(
  input: unknown,
  runner: AiRunner,
): Promise<AiIpcResult> {
  const parsed = aiRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  const result = await runner.run(parsed.data);
  return result.ok ? result : { ok: false, error: result.error.kind };
}

export function cancelAiRequest(
  input: unknown,
  runner: AiRunner,
): AiCancelResult {
  const parsed = aiCancelRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  runner.cancel(parsed.data.operationId);
  return { ok: true, value: null };
}

export function getManualPrompt(
  input: unknown,
  provider: ManualExchangeProvider,
): Result<string> {
  const parsed = aiCancelRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  const prompt = provider.getPrompt(parsed.data.operationId);
  return prompt
    ? { ok: true, value: prompt }
    : { ok: false, error: 'NotFound' };
}

export function submitManualReply(
  input: unknown,
  provider: ManualExchangeProvider,
): AiManualReplyResult {
  const parsed = aiReplyRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  const accepted = provider.provideReply(
    parsed.data.operationId,
    parsed.data.text,
  );
  return accepted
    ? { ok: true, value: null }
    : { ok: false, error: 'NotFound' };
}
