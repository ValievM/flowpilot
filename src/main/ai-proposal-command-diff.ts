import type { Task } from '../domain';
import { parseRulesJson, validateRulesDocument } from '../domain';
import type { AiPlannedCommand } from '../shared/ai-commands';
import type { AiFieldChange, DiffState } from './ai-proposal-diff-types';

export function appendClassificationDiff(
  command: Extract<AiPlannedCommand, { kind: 'task.classify' }>,
  commandIndex: number,
  state: DiffState,
): void {
  const task = state.tasks.get(command.taskId);
  if (command.typeId !== undefined)
    appendChange(state, {
      commandIndex,
      entityId: command.taskId,
      field: 'typeId',
      before: task?.typeId ?? null,
      after: command.typeId,
    });
  if (command.disciplineId !== undefined)
    appendChange(state, {
      commandIndex,
      entityId: command.taskId,
      field: 'disciplineId',
      before: task?.disciplineId ?? null,
      after: command.disciplineId,
    });
  if (task) state.tasks.set(command.taskId, applyClassification(task, command));
}

function applyClassification(
  task: Task,
  command: Extract<AiPlannedCommand, { kind: 'task.classify' }>,
): Task {
  const {
    typeId: previousTypeId,
    disciplineId: previousDisciplineId,
    ...rest
  } = task;
  const typeId =
    command.typeId === undefined
      ? previousTypeId
      : (command.typeId ?? undefined);
  const disciplineId =
    command.disciplineId === undefined
      ? previousDisciplineId
      : (command.disciplineId ?? undefined);
  return {
    ...rest,
    ...(typeId === undefined ? {} : { typeId }),
    ...(disciplineId === undefined ? {} : { disciplineId }),
  };
}

export function appendRuleImportDiff(
  command: Extract<AiPlannedCommand, { kind: 'rule.import' }>,
  commandIndex: number,
  state: DiffState,
): void {
  const parsed = parseRulesJson(command.documentJson);
  if (!parsed.ok) return;
  const validated = validateRulesDocument(parsed.value);
  if (!validated.ok) return;
  const document = validated.document;
  appendChange(state, {
    commandIndex,
    entityId: document.id,
    field: 'document',
    before: state.rules.get(document.id),
    after: document,
  });
  state.rules.set(document.id, document);
}

export function appendRuleActivationDiff(
  command: Extract<AiPlannedCommand, { kind: 'rule.activate' }>,
  commandIndex: number,
  state: DiffState,
): void {
  appendChange(state, {
    commandIndex,
    entityId: command.ruleId,
    field: 'active',
    before: state.activeRuleIds.has(command.ruleId),
    after: true,
  });
  state.activeRuleIds.add(command.ruleId);
}

function appendChange(state: DiffState, change: AiFieldChange): void {
  state.changes.push(change);
}
