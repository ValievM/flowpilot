import {
  aiCommandSchema,
  proposalSchema,
  type AiCommand,
  type Proposal,
} from '../../shared/ai-commands';
import type { RuntimeEnvironment } from '../runtime';
import { AiRunner } from './ai-runner';
import type { AiProvider } from './ai-provider';
import { FakeAiProvider, type FakeAiStep } from './fake-ai-provider';
import { selectAiProvider } from './provider-selection';

// Copying the request out and pasting the reply back takes minutes, not seconds.
const MANUAL_EXCHANGE_TIMEOUT_MS = 10 * 60_000;

export function createStartupAiRunner(
  isPackaged: boolean,
  environment: RuntimeEnvironment,
  manualProvider: AiProvider,
): AiRunner {
  const testEnabled = !isPackaged && environment.FLOWPILOT_TEST === '1';
  const fakeProvider = new FakeAiProvider(
    testEnabled ? testReplyStep(environment.FLOWPILOT_TEST_AI_REPLY) : [],
  );
  // Tests read this to prove the AI is never called unasked (F-07); never set in a real build.
  if (testEnabled)
    Reflect.set(globalThis, '__FLOWPILOT_TEST_AI_CALLS__', fakeProvider.calls);
  return new AiRunner(
    selectAiProvider({ isPackaged, environment, manualProvider, fakeProvider }),
    MANUAL_EXCHANGE_TIMEOUT_MS,
  );
}

function testReplyStep(encodedReply: string | undefined): FakeAiStep[] {
  if (!encodedReply) return [];
  let reply: unknown;
  try {
    reply = JSON.parse(encodedReply);
  } catch {
    return [];
  }
  const proposal = scriptedProposal(reply);
  return proposal
    ? [{ scenario: 'success', proposal }]
    : [{ scenario: 'success', reply }];
}

function scriptedProposal(reply: unknown): Proposal | undefined {
  const parsed = proposalSchema.safeParse(reply);
  if (!parsed.success) return undefined;
  const commands: AiCommand[] = [];
  for (const candidate of parsed.data.commands) {
    const command = aiCommandSchema.safeParse(candidate);
    if (!command.success) return undefined;
    commands.push(command.data);
  }
  return { ...parsed.data, commands };
}
