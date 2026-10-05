import { z } from 'zod';
import {
  aiCommandSchema,
  proposalSchema,
  type AiCommand,
  type Proposal,
} from '../../shared/ai-commands';
import type { ProviderResult } from './ai-provider';

const contextTaskSchema = z.looseObject({ id: z.string().min(1) });
const contextSchema = z.looseObject({ tasks: z.array(contextTaskSchema) });

export function validateProviderReply(
  value: unknown,
  context: unknown,
): ProviderResult<Proposal> {
  const parsed = proposalSchema.safeParse(value);
  const parsedContext = contextSchema.safeParse(context);
  if (!parsed.success || !parsedContext.success) return invalidReply();
  const taskIds = new Set(parsedContext.data.tasks.map(({ id }) => id));
  const commands: AiCommand[] = [];
  for (const candidate of parsed.data.commands) {
    const command = aiCommandSchema.safeParse(candidate);
    if (!command.success || !isTaskReferenceValid(command.data, taskIds)) {
      return invalidReply();
    }
    commands.push(command.data);
  }
  return { ok: true, value: { ...parsed.data, commands } };
}

export function parseProviderText(
  text: string,
  context: unknown,
): ProviderResult<Proposal> {
  try {
    const value: unknown = JSON.parse(text);
    return validateProviderReply(value, context);
  } catch {
    return invalidReply();
  }
}

function isTaskReferenceValid(
  command: AiCommand,
  taskIds: Set<string>,
): boolean {
  if (command.kind === 'task.create') {
    if (taskIds.has(command.task.id)) return false;
    taskIds.add(command.task.id);
    return true;
  }
  const taskId = taskIdFor(command);
  return taskId === undefined || taskIds.has(taskId);
}

function taskIdFor(command: AiCommand): string | undefined {
  switch (command.kind) {
    case 'task.update':
    case 'task.move':
      return command.id;
    case 'task.classify':
    case 'task.setAiRank':
    case 'subtask.add':
    case 'comment.add':
      return command.taskId;
    case 'rule.import':
    case 'rule.activate':
      return undefined;
  }
}

function invalidReply(): ProviderResult<Proposal> {
  return { ok: false, error: { kind: 'InvalidReply' } };
}
