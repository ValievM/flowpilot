import { createHash } from 'node:crypto';
import {
  parseAnswerCreateCards,
  parseAnswerNow,
  parseAnswerReplan,
  parseAnswerRuleEdit,
  renderCreateCardsPrompt,
  renderNowPrompt,
  renderReplanPrompt,
  renderRuleEditPrompt,
} from '../../../domain';
import type { Proposal } from '../../../shared/ai-commands';
import { validateProviderReply } from '../provider-reply';
import {
  createCommands,
  invalidReply,
  mapError,
  proposalFor,
  replanCommands,
  ruleEditCommands,
} from './scenario-proposals';
import type {
  AiUseCaseDependencies,
  AiUseCaseError,
  AiUseCaseResult,
  ProposalScenarioResult,
  ScenarioRequestState,
  WhatNowResult,
} from './scenario-types';

export class AiUseCases {
  constructor(private readonly dependencies: AiUseCaseDependencies) {}

  async whatNow(): Promise<AiUseCaseResult<WhatNowResult>> {
    const state = this.state();
    const prompt = renderNowPrompt({ context: state.context });
    const result = await this.request(prompt, state, 'whatNow');
    if (!result.ok) return result;
    const tasks = state.context.tasks;
    const parsed = parseAnswerNow(result.value, {
      taskIds: tasks.map(({ id }) => id),
      availableTaskIds: tasks
        .filter(
          ({ availability }) =>
            availability === 'available-now' || availability === 'rolled-over',
        )
        .map(({ id }) => id),
      subtasksByTask: tasks.map(({ id, untrusted }) => ({
        taskId: id,
        subtaskIds: untrusted.subtasks.map(({ id: subtaskId }) => subtaskId),
      })),
    });
    if (!parsed.ok) return invalidReply();
    return {
      ok: true,
      value: parsed.value.action
        ? { kind: 'recommendation', answer: parsed.value }
        : { kind: 'no-available-tasks', reason: parsed.value.reason },
    };
  }

  async createFromText(
    text: string,
  ): Promise<AiUseCaseResult<ProposalScenarioResult>> {
    const state = this.state();
    const prompt = renderCreateCardsPrompt({
      text,
      knownTaskIds: state.snapshot.tasks.map(({ id }) => id),
    });
    const result = await this.request(prompt, state, text, true);
    if (!result.ok) return result;
    const parsed = parseAnswerCreateCards(result.value);
    if (!parsed.ok) return invalidReply();
    const commands = createCommands(parsed.value, state, result.operationId);
    if (!commands) return invalidReply();
    const proposal = proposalFor({
      state,
      createdAt: this.dependencies.clock.now().toString(),
      id: result.operationId,
      commands,
      rationale: 'Создать карточки из текста.',
      unknowns: parsed.value.unknowns,
    });
    return this.applyProposal(proposal, state);
  }

  async replan(): Promise<AiUseCaseResult<ProposalScenarioResult>> {
    const state = this.state();
    const prompt = renderReplanPrompt({
      context: state.context,
      columnIds: state.snapshot.columns.map(({ id }) => id),
    });
    const result = await this.request(prompt, state, 'replan');
    if (!result.ok) return result;
    const parsed = parseAnswerReplan(result.value, {
      taskIds: state.snapshot.tasks.map(({ id }) => id),
      columnIds: state.snapshot.columns.map(({ id }) => id),
    });
    if (!parsed.ok) return invalidReply();
    const commands = replanCommands(parsed.value);
    if (!commands) return invalidReply();
    return this.applyProposal(
      proposalFor({
        state,
        createdAt: this.dependencies.clock.now().toString(),
        id: result.operationId,
        commands,
        rationale: parsed.value.rationale,
        unknowns: [],
      }),
      state,
    );
  }

  async editRule(
    instruction: string,
    document: unknown,
  ): Promise<AiUseCaseResult<ProposalScenarioResult>> {
    const state = this.state();
    const prompt = renderRuleEditPrompt({
      instruction,
      document,
      taskIds: state.snapshot.tasks.map(({ id }) => id),
      taskTypeIds: state.snapshot.taskTypes.map(({ id }) => id),
      disciplineIds: state.snapshot.disciplines.map(({ id }) => id),
    });
    const result = await this.request(prompt, state, instruction);
    if (!result.ok) return result;
    const parsed = parseAnswerRuleEdit(result.value, {
      taskIds: state.snapshot.tasks.map(({ id }) => id),
      taskTypeIds: state.snapshot.taskTypes.map(({ id }) => id),
      disciplineIds: state.snapshot.disciplines.map(({ id }) => id),
    });
    if (!parsed.ok) return invalidReply();
    const commands = ruleEditCommands(parsed.value);
    if (!commands) return invalidReply();
    return this.applyProposal(
      proposalFor({
        state,
        createdAt: this.dependencies.clock.now().toString(),
        id: result.operationId,
        commands,
        rationale: instruction,
        unknowns: [],
      }),
      state,
    );
  }

  confirm(proposalId: string): ProposalScenarioResult {
    return this.dependencies.application.confirmProposal(proposalId);
  }

  private state(): ScenarioRequestState {
    const snapshot = this.dependencies.repository.load();
    return {
      context: this.dependencies.getContext(snapshot),
      referenceIndex: this.dependencies.getReferenceIndex(snapshot),
      snapshot,
      references: this.dependencies.getReferenceData(snapshot),
    };
  }

  private async request(
    prompt: ReturnType<typeof renderNowPrompt>,
    state: ScenarioRequestState,
    identity: string,
    stableIdentity = false,
  ): Promise<
    | {
        readonly ok: true;
        readonly value: unknown;
        readonly operationId: string;
      }
    | { readonly ok: false; readonly error: AiUseCaseError }
  > {
    const requestIdentity = stableIdentity
      ? `${identity}\0${prompt.id}\0${prompt.version}`
      : `${identity}\0${prompt.fingerprint}`;
    const operationId = createHash('sha256')
      .update(requestIdentity)
      .digest('hex');
    const requestContext = {
      context: state.context,
      payload: JSON.parse(prompt.data) as unknown,
    };
    const result = await this.dependencies.runner.run({
      operationId,
      context: requestContext,
      referenceIndex: state.referenceIndex,
      instruction: prompt.instruction,
      responseSchema: prompt.responseSchema,
    });
    return result.ok ? { ...result, operationId } : mapError(result.error.kind);
  }

  private applyProposal(
    proposal: Proposal,
    state: ScenarioRequestState,
  ): AiUseCaseResult<ProposalScenarioResult> {
    const mode = this.dependencies.repository.getAiMode();
    if (this.dependencies.repository.appliedOperation(proposal.id))
      return {
        ok: true,
        value: this.dependencies.application.applyProposal(proposal, mode),
      };
    const validation = validateProviderReply(
      proposal,
      { tasks: state.snapshot.tasks.map(({ id }) => ({ id })) },
      state.referenceIndex,
    );
    if (!validation.ok) return invalidReply();
    const outcome = this.dependencies.application.applyProposal(
      validation.value,
      mode,
    );
    if (outcome.kind === 'rejected' && outcome.error.kind === 'StaleProposal') {
      return {
        ok: false,
        error: {
          kind: 'StaleProposal',
          message: outcome.error.message,
        },
      };
    }
    return { ok: true, value: outcome };
  }
}
