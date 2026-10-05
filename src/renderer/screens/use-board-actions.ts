import { useRef, type SyntheticEvent } from 'react';
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
  const completedDialogs = useRef(new WeakSet<HTMLDialogElement>());
  return {
    move: (taskId, column) => moveTask(input, taskId, column),
    confirmWaiting: (event) =>
      confirmWaitingMove(input, event, completedDialogs.current),
    saveColumn: (event) =>
      saveBoardColumn(input, event, completedDialogs.current),
    deleteColumn: (id) =>
      deleteBoardColumn(input, completedDialogs.current, id),
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
  completedDialogs: WeakSet<HTMLDialogElement>,
): Promise<void> {
  event.preventDefault();
  const reason = input.waitingReason.trim();
  if (!input.waitingMove || !reason) return;
  const dialog = event.currentTarget.closest('dialog');
  input.setDialogError('');
  const status = input.waitingUntil
    ? { kind: 'waiting' as const, reason, until: input.waitingUntil }
    : { kind: 'waiting' as const, reason };
  const result = await input.apply([
    {
      kind: 'task.move',
      id: input.waitingMove.taskId,
      columnId: input.waitingMove.columnId,
      status,
    },
  ]);
  if (result.ok) {
    completeDialog(dialog, completedDialogs);
    input.setWaitingMove(undefined);
  } else if (canReportDialogError(dialog, completedDialogs)) {
    input.setDialogError(result.message);
  }
}

async function saveBoardColumn(
  input: ActionsInput,
  event: SyntheticEvent<HTMLFormElement>,
  completedDialogs: WeakSet<HTMLDialogElement>,
): Promise<void> {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = stringField(form.get('name')).trim();
  const description = stringField(form.get('description'));
  if (!name) return;
  const dialog = event.currentTarget.closest('dialog');
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
  if (result.ok) {
    completeDialog(dialog, completedDialogs);
    input.setEditingColumn(undefined);
    input.setCreatingColumn(false);
  } else if (canReportDialogError(dialog, completedDialogs)) {
    input.setDialogError(result.message);
  }
}

async function deleteBoardColumn(
  input: ActionsInput,
  completedDialogs: WeakSet<HTMLDialogElement>,
  columnId = input.deletingId,
): Promise<boolean> {
  if (!input.snapshot || !columnId) return false;
  const hasTasks = input.snapshot.tasks.some(
    (task) => task.columnId === columnId,
  );
  if (hasTasks && !input.deleteTarget) return false;
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  input.setDialogError('');
  const command: CommandsApplyRequest['commands'][number] = {
    kind: 'column.delete',
    id: columnId,
    ...(hasTasks ? { targetColumnId: input.deleteTarget } : {}),
  };
  const result = await input.apply([command]);
  if (!result.ok) {
    if (canReportDialogError(dialog, completedDialogs)) {
      input.setDialogError(result.message);
    }
    return false;
  }
  completeDialog(dialog, completedDialogs);
  input.setDeletingId(undefined);
  input.setDeleteTarget('');
  return true;
}
function canReportDialogError(
  dialog: HTMLDialogElement | null,
  completedDialogs: WeakSet<HTMLDialogElement>,
): boolean {
  return dialog
    ? dialog.isConnected && dialog.open && !completedDialogs.has(dialog)
    : true;
}
function completeDialog(
  dialog: HTMLDialogElement | null,
  completedDialogs: WeakSet<HTMLDialogElement>,
): void {
  if (dialog) completedDialogs.add(dialog);
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
