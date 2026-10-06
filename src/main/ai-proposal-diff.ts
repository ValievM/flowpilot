import type { Task } from '../domain';
import type { AiPlannedCommand } from '../shared/ai-commands';
import type { AiSnapshot } from './ai-proposal-validation';

export interface AiFieldChange {
  readonly commandIndex: number;
  readonly entityId: string;
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

export function buildProposalDiff(
  commands: readonly AiPlannedCommand[],
  snapshot: AiSnapshot,
): readonly AiFieldChange[] {
  const changes: AiFieldChange[] = [];
  commands.forEach((command, commandIndex) => {
    appendCommandDiff(command, commandIndex, snapshot, changes);
  });
  return changes;
}

function appendCommandDiff(
  command: AiPlannedCommand,
  commandIndex: number,
  snapshot: AiSnapshot,
  changes: AiFieldChange[],
): void {
  switch (command.kind) {
    case 'task.create':
      appendCreatedTask(command, commandIndex, changes);
      return;
    case 'task.update':
      appendTaskUpdates(command, commandIndex, snapshot, changes);
      return;
    case 'task.move':
      appendTaskMove(command, commandIndex, snapshot, changes);
      return;
    case 'task.setAiRank':
      appendRankChange(command, commandIndex, snapshot, changes);
      return;
    case 'subtask.add':
      appendSubtaskChange(command, commandIndex, snapshot, changes);
      return;
    case 'comment.add':
      appendCommentChange(command, commandIndex, snapshot, changes);
      return;
    case 'task.classify':
    case 'rule.import':
    case 'rule.activate':
      return;
  }
}

function appendCreatedTask(
  command: Extract<AiPlannedCommand, { kind: 'task.create' }>,
  commandIndex: number,
  changes: AiFieldChange[],
): void {
  Object.entries(command.task).forEach(([field, after]) => {
    changes.push({
      commandIndex,
      entityId: command.task.id,
      field,
      before: undefined,
      after,
    });
  });
}

function appendRankChange(
  command: Extract<AiPlannedCommand, { kind: 'task.setAiRank' }>,
  commandIndex: number,
  snapshot: AiSnapshot,
  changes: AiFieldChange[],
): void {
  appendChange(changes, {
    commandIndex,
    entityId: command.taskId,
    field: 'aiRank',
    before: findTask(snapshot.tasks, command.taskId)?.aiRank,
    after: command.rank,
  });
}

function appendSubtaskChange(
  command: Extract<AiPlannedCommand, { kind: 'subtask.add' }>,
  commandIndex: number,
  snapshot: AiSnapshot,
  changes: AiFieldChange[],
): void {
  const before = findTask(snapshot.tasks, command.taskId)?.subtasks ?? [];
  appendChange(changes, {
    commandIndex,
    entityId: command.taskId,
    field: 'subtasks',
    before,
    after: [...before, command.subtask],
  });
}

function appendCommentChange(
  command: Extract<AiPlannedCommand, { kind: 'comment.add' }>,
  commandIndex: number,
  snapshot: AiSnapshot,
  changes: AiFieldChange[],
): void {
  const before = findTask(snapshot.tasks, command.taskId)?.comments ?? [];
  appendChange(changes, {
    commandIndex,
    entityId: command.taskId,
    field: 'comments',
    before,
    after: [...before, command.comment],
  });
}

function appendTaskUpdates(
  command: Extract<AiPlannedCommand, { kind: 'task.update' }>,
  commandIndex: number,
  snapshot: AiSnapshot,
  changes: AiFieldChange[],
): void {
  const task = findTask(snapshot.tasks, command.id);
  Object.entries(command.changes).forEach(([field, after]) => {
    appendChange(changes, {
      commandIndex,
      entityId: command.id,
      field,
      before: task ? Reflect.get(task, field) : undefined,
      after,
    });
  });
}

function appendTaskMove(
  command: Extract<AiPlannedCommand, { kind: 'task.move' }>,
  commandIndex: number,
  snapshot: AiSnapshot,
  changes: AiFieldChange[],
): void {
  const task = findTask(snapshot.tasks, command.id);
  const column = snapshot.columns.find(({ id }) => id === command.columnId);
  const status = command.status ?? { kind: column?.state ?? 'todo' };
  appendChange(changes, {
    commandIndex,
    entityId: command.id,
    field: 'columnId',
    before: task?.columnId,
    after: command.columnId,
  });
  appendChange(changes, {
    commandIndex,
    entityId: command.id,
    field: 'status',
    before: task?.status,
    after: status,
  });
}

function findTask(tasks: readonly Task[], id: string): Task | undefined {
  return tasks.find((task) => task.id === id);
}

function appendChange(changes: AiFieldChange[], change: AiFieldChange): void {
  changes.push(change);
}
