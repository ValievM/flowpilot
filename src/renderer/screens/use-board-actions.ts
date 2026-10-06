import { type SyntheticEvent } from 'react';
import type { CommandsApplyRequest, IpcSnapshot } from '../../shared/contracts';
import type { ApplyResult } from './use-board-snapshot';

type Column = IpcSnapshot['columns'][number];
type Apply = (
  commands: CommandsApplyRequest['commands'],
) => Promise<ApplyResult>;
type Move = { taskId: string; columnId: string };
type ActionsInput = {
  snapshot: IpcSnapshot | undefined;
  apply: Apply;
  dialogSession: { current: number };
  editingColumn: Column | undefined;
  setEditingColumn: (column: Column | undefined) => void;
  setCreatingColumn: (value: boolean) => void;
  waitingMove: Move | undefined;
  setWaitingMove: (value: Move | undefined) => void;
  waitingReason: string;
  waitingUntil: string;
  setWaitingReason: (value: string) => void;
  setWaitingUntil: (value: string) => void;
  deletingId: string | undefined;
  setDeletingId: (value: string | undefined) => void;
  deleteTarget: string;
  setDeleteTarget: (value: string) => void;
  setDialogError: (message: string) => void;
};

export type BoardActions = {
  move: (taskId: string, column: Column) => Promise<void>;
  confirmWaiting: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>;
  saveColumn: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>;
  deleteColumn: (columnId?: string) => Promise<boolean>;
};

export function useBoardActions(input: ActionsInput): BoardActions {
  return {
    move: (taskId, column) => moveTask(input, taskId, column),
    confirmWaiting: (event) => confirmWaitingMove(input, event),
    saveColumn: (event) => saveBoardColumn(input, event),
    deleteColumn: (id) => deleteBoardColumn(input, id),
  };
}

async function moveTask(
  input: ActionsInput,
  taskId: string,
  column: Column,
): Promise<void> {
  const task = input.snapshot?.tasks.find((item) => item.id === taskId);
  if (!task || task.columnId === column.id) return;
  if (column.state === 'waiting') {
    input.dialogSession.current += 1;
    input.setDialogError('');
    input.setWaitingMove({ taskId, columnId: column.id });
    input.setWaitingReason('');
    input.setWaitingUntil('');
    return;
  }
  await input.apply([
    {
      kind: 'task.move',
      id: task.id,
      columnId: column.id,
      status: { kind: column.state },
    },
  ]);
}

async function confirmWaitingMove(
  input: ActionsInput,
  event: SyntheticEvent<HTMLFormElement>,
): Promise<void> {
  event.preventDefault();
  const reason = input.waitingReason.trim();
  const waitingMove = input.waitingMove;
  if (!waitingMove || !reason) return;
  const session = input.dialogSession.current;
  const status = input.waitingUntil
    ? { kind: 'waiting' as const, reason, until: input.waitingUntil }
    : { kind: 'waiting' as const, reason };
  const result = await input.apply([
    {
      kind: 'task.move',
      id: waitingMove.taskId,
      columnId: waitingMove.columnId,
      status,
    },
  ]);
  if (session !== input.dialogSession.current) return;
  if (result.ok) {
    input.dialogSession.current += 1;
    input.setWaitingMove(undefined);
  } else {
    input.setDialogError(result.message);
  }
}

async function saveBoardColumn(
  input: ActionsInput,
  event: SyntheticEvent<HTMLFormElement>,
): Promise<void> {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = stringField(form.get('name')).trim();
  const description = stringField(form.get('description'));
  if (!name) return;
  const session = input.dialogSession.current;
  input.setDialogError('');
  const state = stringField(form.get('state'), 'todo') as Column['state'];
  const command: CommandsApplyRequest['commands'][number] = input.editingColumn
    ? { kind: 'column.rename', id: input.editingColumn.id, name, description }
    : {
        kind: 'column.create',
        column: {
          id: crypto.randomUUID(),
          name,
          description,
          state,
          builtIn: false,
        },
      };
  const result = await input.apply([command]);
  if (session !== input.dialogSession.current) return;
  if (result.ok) {
    input.dialogSession.current += 1;
    input.setEditingColumn(undefined);
    input.setCreatingColumn(false);
  } else {
    input.setDialogError(result.message);
  }
}

async function deleteBoardColumn(
  input: ActionsInput,
  columnId = input.deletingId,
): Promise<boolean> {
  if (!input.snapshot || !columnId) return false;
  const hasTasks = input.snapshot.tasks.some(
    (task) => task.columnId === columnId,
  );
  if (hasTasks && !input.deleteTarget) return false;
  const session = input.dialogSession.current;
  input.setDialogError('');
  const command: CommandsApplyRequest['commands'][number] = {
    kind: 'column.delete',
    id: columnId,
    ...(hasTasks ? { targetColumnId: input.deleteTarget } : {}),
  };
  const result = await input.apply([command]);
  if (session !== input.dialogSession.current) return false;
  if (!result.ok) {
    input.setDialogError(result.message);
    return false;
  }
  input.dialogSession.current += 1;
  input.setDeletingId(undefined);
  input.setDeleteTarget('');
  return true;
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
