import type Database from 'better-sqlite3';
import { insertTask, setTaskAiRank, updateTask } from './task-records';
import type { StorageCommand } from './types';
import {
  addComment,
  addSubtask,
  completeSubtask,
  moveTask,
} from './task-relations';

export function executeTaskCommand(
  database: Database.Database,
  command: StorageCommand,
  now: string,
): void {
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
    case 'subtask.add':
      addSubtask(database, command.taskId, command.subtask, now);
      return;
    case 'subtask.complete':
      completeSubtask(database, command, now);
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
