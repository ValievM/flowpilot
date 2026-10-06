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

export function createStartupAiRunner(
  isPackaged: boolean,
  environment: RuntimeEnvironment,
  manualProvider: AiProvider,
): AiRunner {
  const testEnabled = !isPackaged && environment.FLOWPILOT_TEST === '1';
  const fakeProvider = new FakeAiProvider(
    testEnabled ? testReplyStep(environment.FLOWPILOT_TEST_AI_REPLY) : [],
  );
  return new AiRunner(
    selectAiProvider({ isPackaged, environment, manualProvider, fakeProvider }),
  );
}

function testReplyStep(encodedReply: string | undefined): FakeAiStep[] {
  if (!encodedReply) return [];
  try {
    const parsed = proposalSchema.safeParse(JSON.parse(encodedReply));
    if (!parsed.success) return [];
    const commands: AiCommand[] = [];
    for (const candidate of parsed.data.commands) {
      const command = aiCommandSchema.safeParse(candidate);
      if (!command.success) return [];
      commands.push(command.data);
    }
    const proposal: Proposal = { ...parsed.data, commands };
    return [{ scenario: 'success', proposal }];
  } catch {
    return [];
  }
}
