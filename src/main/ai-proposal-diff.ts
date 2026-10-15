import type { Task } from '../domain';
import type { AiTaskChanges, AiPlannedCommand } from '../shared/ai-commands';
import {
  appendClassificationDiff,
  appendRuleActivationDiff,
  appendRuleImportDiff,
} from './ai-proposal-command-diff';
import type { AiFieldChange, DiffState } from './ai-proposal-diff-types';
import type { AiSnapshot } from './ai-proposal-validation';

export type { AiFieldChange } from './ai-proposal-diff-types';

export function buildProposalDiff(
  commands: readonly AiPlannedCommand[],
  snapshot: AiSnapshot,
): readonly AiFieldChange[] {
  const state: DiffState = {
    tasks: new Map(snapshot.tasks.map((task) => [task.id, task])),
    columns: snapshot.columns,
    rules: new Map(
      snapshot.currentRuleDocuments.map((rule) => [rule.id, rule]),
    ),
    activeRuleIds: new Set(snapshot.rules.map((rule) => rule.id)),
    changes: [],
  };
  commands.forEach((command, commandIndex) => {
    appendCommandDiff(command, commandIndex, state);
  });
  return state.changes;
}

function appendCommandDiff(
  command: AiPlannedCommand,
  commandIndex: number,
  state: DiffState,
): void {
  switch (command.kind) {
    case 'task.create':
      appendCreatedTask(command, commandIndex, state);
      return;
    case 'task.update':
      appendTaskUpdates(command, commandIndex, state);
      return;
    case 'task.move':
      appendTaskMove(command, commandIndex, state);
      return;
    case 'task.setAiRank':
      appendRankChange(command, commandIndex, state);
      return;
    case 'subtask.add':
      appendSubtaskChange(command, commandIndex, state);
      return;
    case 'comment.add':
      appendCommentChange(command, commandIndex, state);
      return;
    case 'task.classify':
      appendClassificationDiff(command, commandIndex, state);
      return;
    case 'rule.import':
      appendRuleImportDiff(command, commandIndex, state);
      return;
    case 'rule.activate':
      appendRuleActivationDiff(command, commandIndex, state);
      return;
  }
}

function appendCreatedTask(
  command: Extract<AiPlannedCommand, { kind: 'task.create' }>,
  commandIndex: number,
  state: DiffState,
): void {
  Object.entries(command.task).forEach(([field, after]) => {
    appendChange(state, {
      commandIndex,
      entityId: command.task.id,
      field,
      before: undefined,
      after,
    });
  });
  state.tasks.set(command.task.id, command.task);
}

function appendRankChange(
  command: Extract<AiPlannedCommand, { kind: 'task.setAiRank' }>,
  commandIndex: number,
  state: DiffState,
): void {
  const task = state.tasks.get(command.taskId);
  appendChange(state, {
    commandIndex,
    entityId: command.taskId,
    field: 'aiRank',
    before: task?.aiRank,
    after: command.rank,
  });
  if (task) state.tasks.set(command.taskId, { ...task, aiRank: command.rank });
}

function appendSubtaskChange(
  command: Extract<AiPlannedCommand, { kind: 'subtask.add' }>,
  commandIndex: number,
  state: DiffState,
): void {
  const task = state.tasks.get(command.taskId);
  const before = task?.subtasks ?? [];
  const after = [...before, command.subtask];
  appendChange(state, {
    commandIndex,
    entityId: command.taskId,
    field: 'subtasks',
    before,
    after,
  });
  if (task) state.tasks.set(command.taskId, { ...task, subtasks: after });
}

function appendCommentChange(
  command: Extract<AiPlannedCommand, { kind: 'comment.add' }>,
  commandIndex: number,
  state: DiffState,
): void {
  const task = state.tasks.get(command.taskId);
  const before = task?.comments ?? [];
  const after = [...before, command.comment];
  appendChange(state, {
    commandIndex,
    entityId: command.taskId,
    field: 'comments',
    before,
    after,
  });
  if (task) state.tasks.set(command.taskId, { ...task, comments: after });
}

function appendTaskUpdates(
  command: Extract<AiPlannedCommand, { kind: 'task.update' }>,
  commandIndex: number,
  state: DiffState,
): void {
  const task = state.tasks.get(command.id);
  Object.entries(command.changes).forEach(([field, after]) => {
    appendChange(state, {
      commandIndex,
      entityId: command.id,
      field,
      before: task ? Reflect.get(task, field) : undefined,
      after,
    });
  });
  if (task)
    state.tasks.set(command.id, applyTaskChanges(task, command.changes));
}

function applyTaskChanges(task: Task, changes: AiTaskChanges): Task {
  const {
    description: previousDescription,
    day: previousDay,
    time: previousTime,
    deadline: previousDeadline,
    estimate: previousEstimate,
    ...taskWithoutNullableFields
  } = task;
  const description = resolveOptionalChange(
    previousDescription,
    changes.description,
  );
  const day = resolveOptionalChange(previousDay, changes.day);
  const time = resolveOptionalChange(previousTime, changes.time);
  const deadline = resolveOptionalChange(previousDeadline, changes.deadline);
  const estimate = resolveOptionalChange(previousEstimate, changes.estimate);
  return {
    ...taskWithoutNullableFields,
    ...(changes.title === undefined ? {} : { title: changes.title }),
    ...(description === undefined ? {} : { description }),
    ...(day === undefined ? {} : { day }),
    ...(time === undefined ? {} : { time }),
    ...(deadline === undefined ? {} : { deadline }),
    ...(estimate === undefined ? {} : { estimate }),
  };
}

function resolveOptionalChange<T>(
  current: T | undefined,
  changed: T | null | undefined,
): T | undefined {
  if (changed === undefined) return current;
  return changed === null ? undefined : changed;
}

function appendTaskMove(
  command: Extract<AiPlannedCommand, { kind: 'task.move' }>,
  commandIndex: number,
  state: DiffState,
): void {
  const task = state.tasks.get(command.id);
  const column = state.columns.find(({ id }) => id === command.columnId);
  const status: Task['status'] | undefined =
    command.status ??
    (column?.state === 'waiting'
      ? undefined
      : { kind: column?.state ?? 'todo' });
  appendChange(state, {
    commandIndex,
    entityId: command.id,
    field: 'columnId',
    before: task?.columnId,
    after: command.columnId,
  });
  appendChange(state, {
    commandIndex,
    entityId: command.id,
    field: 'status',
    before: task?.status,
    after: status,
  });
  if (task && status)
    state.tasks.set(command.id, {
      ...task,
      columnId: command.columnId,
      status,
    });
}

function appendChange(state: DiffState, change: AiFieldChange): void {
  state.changes.push(change);
}
