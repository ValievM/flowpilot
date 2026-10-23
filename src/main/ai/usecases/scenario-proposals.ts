import { createHash } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import type { AiCommand, Proposal } from '../../../shared/ai-commands';
import { aiCommandSchema } from '../../../shared/ai-commands';
import type {
  CreateCardsAnswer,
  ReplanAnswer,
  RuleEditAnswer,
} from '../../../domain';
import type { AiUseCaseError, ScenarioRequestState } from './scenario-types';

export function createCommands(
  answer: CreateCardsAnswer,
  state: ScenarioRequestState,
  operationId: string,
): readonly AiCommand[] | undefined {
  const columnId = state.referenceIndex.columns.find(
    ({ state: value }) => value === 'todo',
  )?.id;
  if (!columnId) return undefined;
  const commands: AiCommand[] = [];
  answer.cards.forEach((card, index) => {
    const taskId = taskIdFor(operationId, index);
    const task = {
      id: taskId,
      title: card.title,
      ...(card.description === undefined
        ? {}
        : { description: card.description }),
      ...(card.day === undefined
        ? {}
        : { day: Temporal.PlainDate.from(card.day) }),
      ...(card.deadline === undefined
        ? {}
        : { deadline: Temporal.PlainDate.from(card.deadline) }),
      ...(card.estimate === undefined ? {} : { estimate: card.estimate }),
      columnId,
      subtasks: [],
    };
    commands.push({ kind: 'task.create', task });
    card.subtasks.forEach((subtask, subtaskIndex) => {
      commands.push({
        kind: 'subtask.add',
        taskId,
        subtask: {
          id: `${taskId}:subtask:${String(subtaskIndex)}`,
          title: subtask.title,
          completed: false,
        },
      });
    });
  });
  return commands;
}

export function replanCommands(
  answer: ReplanAnswer,
): readonly AiCommand[] | undefined {
  const commands: AiCommand[] = [];
  for (const candidate of answer.commands) {
    const parsed = aiCommandSchema.safeParse(candidate);
    if (!parsed.success) return undefined;
    commands.push(parsed.data);
  }
  return commands;
}

export function ruleEditCommands(
  answer: RuleEditAnswer,
): readonly AiCommand[] | undefined {
  const documentJson = JSON.stringify(answer.document);
  const imported = aiCommandSchema.safeParse({
    kind: 'rule.import',
    documentJson,
  });
  const activate = aiCommandSchema.safeParse({
    kind: 'rule.activate',
    ruleId: answer.document.id,
  });
  if (!imported.success || !activate.success) return undefined;
  return [imported.data, activate.data];
}

export function proposalFor(input: {
  readonly state: ScenarioRequestState;
  readonly createdAt: string;
  readonly id: string;
  readonly commands: readonly AiCommand[];
  readonly rationale: string;
  readonly unknowns: readonly string[];
}): Proposal {
  return {
    id: input.id,
    baseRevision: input.state.snapshot.revision,
    ruleVersions: input.state.references.ruleVersions,
    commands: input.commands,
    rationale: input.rationale,
    unknowns: input.unknowns,
    createdAt: input.createdAt,
  };
}

export function mapError(kind: string): {
  readonly ok: false;
  readonly error: AiUseCaseError;
} {
  switch (kind) {
    case 'ProviderUnavailable':
      return error(
        'ProviderUnavailable',
        'AI сейчас недоступен. Можно продолжить работу вручную.',
      );
    case 'InvalidReply':
      return invalidReply();
    case 'AlreadyRunning':
      return error('AlreadyRunning', 'Этот запрос уже выполняется.');
    case 'Aborted':
      return error('Aborted', 'Запрос AI отменён.');
    default:
      return invalidReply();
  }
}

export function invalidReply(): {
  readonly ok: false;
  readonly error: AiUseCaseError;
} {
  return {
    ok: false,
    error: {
      kind: 'InvalidReply',
      message: 'AI вернул ответ, который не удалось проверить.',
    },
  };
}

function taskIdFor(operationId: string, index: number): string {
  return `ai-task-${createHash('sha256')
    .update(`${operationId}:${String(index)}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function error(
  kind: AiUseCaseError['kind'],
  message: string,
): { readonly ok: false; readonly error: AiUseCaseError } {
  return { ok: false, error: { kind, message } };
}
