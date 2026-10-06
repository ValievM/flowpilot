import type { ApplyResult, AiMode, Repository } from '../storage';
import {
  proposalSchema,
  type AiPlannedCommand,
  type Proposal,
} from '../shared/ai-commands';
import {
  cloneAiCommands,
  findUnpersistedCommands,
  isStale,
  toStorageCommands,
  validateProposal,
  type RejectedAiCommand,
} from './ai-proposals';
import { buildProposalDiff, type AiFieldChange } from './ai-proposal-diff';
import type { AiSnapshot } from './ai-proposal-validation';

export type AiReferenceData = Pick<
  AiSnapshot,
  'ruleVersions' | 'taskTypes' | 'disciplines' | 'rules'
>;
type PersistedAiCommand = Extract<
  AiPlannedCommand,
  {
    kind:
      | 'task.create'
      | 'task.update'
      | 'task.move'
      | 'subtask.add'
      | 'comment.add'
      | 'task.setAiRank';
  }
>;

type RejectedCommand = RejectedAiCommand;

type PendingProposal = {
  readonly proposal: Proposal;
  readonly rejectedCommands: readonly RejectedCommand[];
};

type ConfirmationData = {
  readonly proposal: Proposal;
  readonly changes: readonly AiFieldChange[];
  readonly rejectedCommands: readonly RejectedCommand[];
};

export type ProposalOutcome =
  | {
      readonly kind: 'confirmation-required';
      readonly proposalId: string;
      readonly diff: {
        readonly changes: readonly AiFieldChange[];
        readonly rejectedCommands: readonly RejectedCommand[];
      };
      readonly rejectedCommands: readonly RejectedCommand[];
    }
  | {
      readonly kind: 'applied';
      readonly revision: number;
      readonly rejectedCommands: readonly RejectedCommand[];
      readonly replayed: boolean;
    }
  | { readonly kind: 'rejected'; readonly error: ProposalError };

export type ProposalError =
  | { readonly kind: 'InvalidProposal'; readonly message: string }
  | {
      readonly kind: 'StaleProposal';
      readonly message: string;
      readonly expectedRevision: number;
      readonly actualRevision: number;
    }
  | {
      readonly kind: 'NotPersistedYet';
      readonly reason: 'not-persisted-yet';
      readonly message: string;
      readonly commands: readonly RejectedCommand[];
    }
  | { readonly kind: 'ApplyFailed'; readonly message: string }
  | { readonly kind: 'Declined'; readonly message: string }
  | { readonly kind: 'NotPending'; readonly proposalId: string };

const EMPTY_REFERENCES: AiReferenceData = {
  ruleVersions: {},
  taskTypes: [],
  disciplines: [],
  rules: [],
};

export class AiProposalApplication {
  private readonly pending = new Map<string, PendingProposal>();
  private readonly completed = new Map<
    string,
    Extract<ProposalOutcome, { kind: 'applied' }>
  >();

  constructor(
    private readonly repository: Repository,
    private readonly getReferences: () => AiReferenceData = () =>
      EMPTY_REFERENCES,
  ) {}

  applyProposal(input: unknown, mode: AiMode): ProposalOutcome {
    const parsed = proposalSchema.safeParse(input);
    if (!parsed.success)
      return rejected({
        kind: 'InvalidProposal',
        message: 'Предложение AI имеет неверный формат и не применено.',
      });
    const proposalId = parsed.data.id;
    const completed = this.completed.get(proposalId);
    if (completed) return { ...completed, replayed: true };
    const appliedOperation = this.repository.appliedOperation(proposalId);
    if (appliedOperation !== undefined)
      return applied(
        appliedOperation.revision,
        appliedOperation.rejectedCommands,
        true,
      );
    if (!isAiMode(mode))
      return rejected({
        kind: 'InvalidProposal',
        message: 'Неизвестный режим применения AI.',
      });
    return this.prepareAndApply(parsed.data, mode);
  }

  confirmProposal(proposalId: string): ProposalOutcome {
    const appliedOperation = this.repository.appliedOperation(proposalId);
    if (appliedOperation !== undefined) {
      const completed = this.completed.get(proposalId);
      return completed
        ? { ...completed, replayed: true }
        : applied(
            appliedOperation.revision,
            appliedOperation.rejectedCommands,
            true,
          );
    }
    const pending = this.pending.get(proposalId);
    if (!pending) return rejected({ kind: 'NotPending', proposalId });
    return this.prepareAndApply(
      pending.proposal,
      'confirm',
      true,
      pending.rejectedCommands,
    );
  }

  rejectProposal(proposalId: string): ProposalOutcome {
    if (!this.pending.delete(proposalId))
      return rejected({ kind: 'NotPending', proposalId });
    return rejected({
      kind: 'Declined',
      message: 'Предложение отклонено; данные не изменены.',
    });
  }

  private prepareAndApply(
    input: unknown,
    mode: AiMode,
    confirmed = false,
    stagedRejectedCommands: readonly RejectedCommand[] = [],
  ): ProposalOutcome {
    const parsed = proposalSchema.safeParse(input);
    if (!parsed.success)
      return rejected({
        kind: 'InvalidProposal',
        message: 'Предложение AI имеет неверный формат и не применено.',
      });
    const unsupportedOutcome = rejectUnpersistedProposal(parsed.data.commands);
    if (unsupportedOutcome) return unsupportedOutcome;
    const snapshot = this.currentSnapshot();
    if (isStale(parsed.data, snapshot.revision, snapshot.ruleVersions))
      return rejected(staleProposal(parsed.data, snapshot));
    const validation = validateProposal(input, snapshot);
    const rejectedCommands = [
      ...stagedRejectedCommands,
      ...validation.rejectedCommands,
    ];
    const needsConfirmation = mode === 'confirm' && !confirmed;
    const commandsForDiff = needsConfirmation
      ? cloneAiCommands(validation.validCommands)
      : validation.validCommands;
    const batch = toStorageCommands(commandsForDiff, snapshot);
    const commands = batch.commands.filter(isStorageCommand);
    if (needsConfirmation)
      return this.requireConfirmation({
        proposal: { ...parsed.data, commands: validation.validCommands },
        changes: buildProposalDiff(batch.commands, snapshot),
        rejectedCommands,
      });
    const result = this.repository.apply(commands, parsed.data.baseRevision, {
      source: 'ai',
      proposalId: parsed.data.id,
      rejectedCommands,
    });
    const outcome = applyResult(result, rejectedCommands);
    if (outcome.kind === 'applied') {
      this.pending.delete(parsed.data.id);
      this.completed.set(parsed.data.id, outcome);
    }
    return outcome;
  }

  private requireConfirmation({
    proposal,
    changes,
    rejectedCommands,
  }: ConfirmationData): ProposalOutcome {
    this.pending.set(proposal.id, {
      proposal: { ...proposal, commands: cloneAiCommands(proposal.commands) },
      rejectedCommands: rejectedCommands.map((command) => ({ ...command })),
    });
    return {
      kind: 'confirmation-required',
      proposalId: proposal.id,
      diff: { changes, rejectedCommands },
      rejectedCommands,
    };
  }

  private currentSnapshot(): AiSnapshot {
    const current = this.repository.load();
    return { ...current, ...this.getReferences() };
  }
}

function rejectUnpersistedProposal(
  commands: readonly unknown[],
): ProposalOutcome | undefined {
  const unsupported = findUnpersistedCommands(commands);
  if (unsupported.length === 0) return undefined;
  return rejected({
    kind: 'NotPersistedYet',
    reason: 'not-persisted-yet',
    message: 'Предложение содержит изменения, которые пока нельзя сохранить.',
    commands: unsupported,
  });
}
function isStorageCommand(
  command: AiPlannedCommand,
): command is PersistedAiCommand {
  return (
    command.kind !== 'task.classify' &&
    command.kind !== 'rule.import' &&
    command.kind !== 'rule.activate'
  );
}

function applyResult(
  result: ApplyResult,
  rejectedCommands: readonly RejectedCommand[],
): ProposalOutcome {
  if (result.ok) return applied(result.value.revision, rejectedCommands, false);
  if (result.error.kind === 'StaleRevision')
    return rejected({
      kind: 'StaleProposal',
      message: 'Предложение устарело: данные изменились. Запросите новое.',
      expectedRevision: result.error.expected,
      actualRevision: result.error.actual,
    });
  return rejected({
    kind: 'ApplyFailed',
    message: 'Предложение не применено; данные не изменены.',
  });
}

function staleProposal(
  proposal: Pick<Proposal, 'baseRevision'>,
  snapshot: AiSnapshot,
): ProposalError {
  return {
    kind: 'StaleProposal',
    message:
      'Предложение устарело: данные или правила изменились. Запросите новое.',
    expectedRevision: proposal.baseRevision,
    actualRevision: snapshot.revision,
  };
}

function applied(
  revision: number,
  rejectedCommands: readonly RejectedCommand[],
  replayed: boolean,
): ProposalOutcome {
  return { kind: 'applied', revision, rejectedCommands, replayed };
}

function rejected(error: ProposalError): ProposalOutcome {
  return { kind: 'rejected', error };
}

function isAiMode(value: unknown): value is AiMode {
  return value === 'auto' || value === 'confirm';
}
