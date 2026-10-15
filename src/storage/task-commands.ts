import type Database from 'better-sqlite3';
import { moveSubtask, removeSubtask, renameSubtask } from '../domain';
import { insertTask, setTaskAiRank, updateTask } from './task-records';
import type { StorageCommand } from './types';
import {
  addComment,
  addSubtask,
  completeSubtask,
  editSubtasks,
  moveTask,
} from './task-relations';

type SubtaskCommand = Extract<StorageCommand, { kind: `subtask.${string}` }>;

export function executeTaskCommand(
  database: Database.Database,
  command: StorageCommand,
  now: string,
): void {
  if (isSubtaskCommand(command)) {
    executeSubtaskCommand(database, command, now);
    return;
  }
  switch (command.kind) {
    case 'task.create':
      insertTask(database, command.task, now);
      return;
    case 'task.update':
      updateTask(database, command.id, command.changes, now);
      return;
    case 'task.move':
      moveTask(database, command, now);
      return;
    case 'comment.add':
      addComment(database, command.taskId, command.comment, now);
      return;
    case 'task.setAiRank':
      setTaskAiRank(database, command.taskId, command.rank, now);
      return;
    default:
      throw new Error('Unsupported task command');
  }
}

function isSubtaskCommand(command: StorageCommand): command is SubtaskCommand {
  return command.kind.startsWith('subtask.');
}

function executeSubtaskCommand(
  database: Database.Database,
  command: SubtaskCommand,
  now: string,
): void {
  switch (command.kind) {
    case 'subtask.add':
      addSubtask(database, command.taskId, command.subtask, now);
      return;
    case 'subtask.complete':
      completeSubtask(database, command, now);
      return;
    case 'subtask.rename':
      editSubtasks(database, command.taskId, now, (task) =>
        renameSubtask(task, command.subtaskId, command.title),
      );
      return;
    case 'subtask.remove':
      editSubtasks(database, command.taskId, now, (task) =>
        removeSubtask(task, command.subtaskId),
      );
      return;
    case 'subtask.move':
      editSubtasks(database, command.taskId, now, (task) =>
        moveSubtask(task, command.subtaskId, command.position),
      );
      return;
  }
}
