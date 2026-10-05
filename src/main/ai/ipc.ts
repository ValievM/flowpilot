import { createAiReferenceIndex } from '../../shared/ai-reference-index';
import type { Snapshot } from '../../storage';
import type { TaskStatus } from '../../domain';
import { Temporal } from 'temporal-polyfill';
import type {
  AiCommand,
  AiTaskChanges,
  AiTaskCreation,
  Proposal,
} from '../../shared/ai-commands';
import {
  aiCancelRequestSchema,
  aiReplyRequestSchema,
  aiRequestSchema,
  type AiCancelResult,
  type AiIpcResult,
  type AiIpcCommand,
  type AiIpcProposal,
  type AiManualReplyResult,
} from '../../shared/contracts';
import type { Result } from '../../shared/ipc-result';
import type { AiRunner } from './ai-runner';
import type { ManualExchangeProvider } from './manual-exchange-provider';

export async function runAiRequest(
  input: unknown,
  runner: AiRunner,
  snapshot: Pick<Snapshot, 'columns' | 'tasks'>,
): Promise<AiIpcResult> {
  const parsed = aiRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'ValidationFailed' };
  const result = await runner.run({
    ...parsed.data,
    referenceIndex: createAiReferenceIndex({
      columns: snapshot.columns,
      tasks: snapshot.tasks,
      taskTypes: parsed.data.referenceIndex.taskTypeIds.map((id) => ({ id })),
      disciplines: parsed.data.referenceIndex.disciplineIds.map((id) => ({
        id,
      })),
      rules: parsed.data.referenceIndex.ruleIds.map((id) => ({ id })),
    }),
  });
  if (!result.ok) return { ok: false, error: result.error.kind };
  return { ok: true, value: serializeProposal(result.value) };
}

function serializeProposal(proposal: Proposal): AiIpcProposal {
  return {
    ...proposal,
    commands: proposal.commands.map(serializeCommand),
  };
}

function serializeCommand(command: AiCommand): AiIpcCommand {
  if (command.kind === 'task.create') {
    return { ...command, task: serializeTaskCreation(command.task) };
  }
  if (command.kind === 'task.update') {
    return { ...command, changes: serializeTaskChanges(command.changes) };
  }
  if (command.kind === 'task.move') {
    return command.status
      ? {
          kind: 'task.move',
          id: command.id,
          columnId: command.columnId,
          status: serializeMoveStatus(command.status),
        }
      : { kind: 'task.move', id: command.id, columnId: command.columnId };
  }
  return command;
}

function serializeMoveStatus(
  status: TaskStatus,
): NonNullable<Extract<AiIpcCommand, { kind: 'task.move' }>['status']> {
  if (status.kind !== 'waiting') return status;
  const { until, ...waitingStatus } = status;
  return until
    ? {
        ...waitingStatus,
        until: Temporal.PlainDate.from(until).toString(),
      }
    : waitingStatus;
}

function serializeTaskCreation(task: AiTaskCreation) {
  const { day, time, deadline, ...remaining } = task;
  return {
    ...remaining,
    ...(day ? { day: Temporal.PlainDate.from(day).toString() } : {}),
    ...(time ? { time: Temporal.PlainTime.from(time).toString() } : {}),
    ...(deadline
      ? { deadline: Temporal.PlainDate.from(deadline).toString() }
      : {}),
  };
}

function serializeTaskChanges(changes: AiTaskChanges) {
  const { day, time, deadline, ...remaining } = changes;
  return {
    ...remaining,
    ...(day !== undefined
      ? { day: day === null ? null : Temporal.PlainDate.from(day).toString() }
      : {}),
    ...(time !== undefined
      ? {
          time: time === null ? null : Temporal.PlainTime.from(time).toString(),
        }
      : {}),
    ...(deadline !== undefined
      ? {
          deadline:
            deadline === null
              ? null
              : Temporal.PlainDate.from(deadline).toString(),
        }
      : {}),
  };
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
