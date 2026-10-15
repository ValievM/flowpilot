import type { AiContext, NowAnswer } from '../../../domain';
import type {
  AiProposalApplication,
  AiReferenceData,
  ProposalOutcome,
} from '../../ai-proposal-application';
import type { AiReferenceIndex } from '../../../shared/ai-reference-index';
import type { AiRunner } from '../ai-runner';
import type {
  AiMode,
  AppliedOperation,
  Clock,
  Snapshot,
} from '../../../storage';

export interface AiUseCaseDependencies {
  readonly runner: AiRunner;
  readonly application: AiProposalApplication;
  readonly repository: {
    load(): Snapshot;
    getAiMode(): AiMode;
    appliedOperation(proposalId: string): AppliedOperation | undefined;
  };
  readonly getContext: (snapshot: Snapshot) => AiContext;
  readonly getReferenceIndex: (snapshot: Snapshot) => AiReferenceIndex;
  readonly getReferenceData: (snapshot: Snapshot) => AiReferenceData;
  readonly clock: Clock;
}

export type AiUseCaseError = {
  readonly kind:
    | 'ProviderUnavailable'
    | 'InvalidReply'
    | 'AlreadyRunning'
    | 'Aborted'
    | 'StaleProposal';
  readonly message: string;
};

export type AiUseCaseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AiUseCaseError };

export type WhatNowResult =
  | { readonly kind: 'recommendation'; readonly answer: NowAnswer }
  | { readonly kind: 'no-available-tasks'; readonly reason: string };

export type ProposalScenarioResult = ProposalOutcome;

export interface ScenarioRequestState {
  readonly context: AiContext;
  readonly referenceIndex: AiReferenceIndex;
  readonly snapshot: Snapshot;
  readonly references: AiReferenceData;
}
