import type { Task } from '../domain';
import {
  aiCommandSchema,
  proposalSchema,
  type AiCommand,
  type AiCommandBatch,
  type AiPlannedCommand,
  type AiTaskCreation,
  type Proposal,
} from '../shared/ai-commands';
import {
  createValidationState,
  recordCommandIds,
  validateCommand,
  type AiSnapshot,
} from './ai-proposal-validation';
export type { AiSnapshot } from './ai-proposal-validation';

export interface RejectedAiCommand {
  readonly index: number;
  readonly kind: string;
  readonly reason: string;
}

export interface ProposalValidation {
  readonly validCommands: readonly AiCommand[];
  readonly rejectedCommands: readonly RejectedAiCommand[];
}

export function isStale(
  proposal: Pick<Proposal, 'baseRevision' | 'ruleVersions'>,
  currentRevision: number,
  currentRuleVersions: Readonly<Record<string, string>>,
): boolean {
  const expected = Object.entries(proposal.ruleVersions).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const current = Object.entries(currentRuleVersions).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return (
    proposal.baseRevision !== currentRevision ||
    JSON.stringify(expected) !== JSON.stringify(current)
  );
}

export function validateProposal(
  proposal: unknown,
  snapshot: AiSnapshot,
): ProposalValidation {
  const parsed = proposalSchema.safeParse(proposal);
  if (!parsed.success) {
    return {
      validCommands: [],
      rejectedCommands: [
        { index: -1, kind: 'proposal', reason: 'invalid-proposal' },
      ],
    };
  }
  if (isStale(parsed.data, snapshot.revision, snapshot.ruleVersions)) {
    return {
      validCommands: [],
      rejectedCommands: parsed.data.commands.map((command, index) => ({
        index,
        kind: commandKind(command),
        reason: 'stale-proposal',
      })),
    };
  }
  const validCommands: AiCommand[] = [];
  const rejectedCommands: RejectedAiCommand[] = [];
  const state = createValidationState(snapshot);
  parsed.data.commands.forEach((candidate, index) => {
    const parsedCommand = aiCommandSchema.safeParse(candidate);
    if (!parsedCommand.success) {
      rejectedCommands.push({
        index,
        kind: commandKind(candidate),
        reason: 'invalid-command',
      });
      return;
    }
    const command = parsedCommand.data;
    const reason = validateCommand(command, state);
    if (reason) {
      rejectedCommands.push({ index, kind: command.kind, reason });
      return;
    }
    validCommands.push(command);
    recordCommandIds(command, state);
  });
  return { validCommands, rejectedCommands };
}

function commandKind(command: unknown): string {
  if (typeof command !== 'object' || command === null || !('kind' in command))
    return 'unknown';
  return typeof command.kind === 'string' ? command.kind : 'unknown';
}

export function toStorageCommands(
  commands: readonly AiCommand[],
  snapshot: AiSnapshot,
): AiCommandBatch {
  let nextAddedOrder =
    snapshot.tasks.reduce(
      (highest, existing) => Math.max(highest, existing.addedOrder),
      -1,
    ) + 1;
  const plannedCommands: AiPlannedCommand[] = commands.map((command) => {
    if (command.kind !== 'task.create') return command;
    const task = buildTask(command.task, snapshot, nextAddedOrder);
    nextAddedOrder += 1;
    return { kind: 'task.create', task };
  });
  return { commands: plannedCommands, source: 'ai' };
}

function buildTask(
  task: AiTaskCreation,
  snapshot: AiSnapshot,
  addedOrder: number,
): Task {
  const column = snapshot.columns.find(
    (candidate) => candidate.id === task.columnId,
  );
  if (!column || column.state === 'waiting')
    throw new Error('Cannot build an AI task without a supported column');
  const { comment, ...fields } = task;
  return {
    ...fields,
    status: { kind: column.state },
    comments: comment ? [comment] : [],
    attachments: [],
    addedOrder,
  };
}
