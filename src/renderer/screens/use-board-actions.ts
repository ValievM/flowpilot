import React, { type SyntheticEvent } from 'react';
import type { CommandsApplyRequest, IpcSnapshot } from '../../shared/contracts';
import type { ApplyResult } from './use-board-snapshot';

type Column = IpcSnapshot['columns'][number];
type Apply = (
  commands: CommandsApplyRequest['commands'],
  isCurrent?: () => boolean,
) => Promise<ApplyResult>;
type Move = { taskId: string; columnId: string };
type ActionsInput = {
  snapshot: IpcSnapshot | undefined;
  apply: Apply;
  dialogSubmission: React.RefObject<number | undefined>;
  inFlightMoves: React.RefObject<Map<string, Set<string>>>;
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
  move: (taskId: string, column: Column) => Promise<boolean>;
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
): Promise<boolean> {
  const task = input.snapshot?.tasks.find((item) => item.id === taskId);
  if (!task || task.columnId === column.id) return false;
  if (
    input.waitingMove?.taskId === taskId &&
    input.waitingMove.columnId === column.id
  ) {
    return false;
  }
  const targetState = column.state;
  if (targetState === 'waiting') {
    input.dialogSession.current += 1;
    input.setDialogError('');
    input.setWaitingMove({ taskId, columnId: column.id });
    input.setWaitingReason('');
    input.setWaitingUntil('');
    return false;
  }
  return applyTaskMove(input, taskId, column, targetState);
}

async function applyTaskMove(
  input: ActionsInput,
  taskId: string,
  column: Column,
  state: Exclude<Column['state'], 'waiting'>,
): Promise<boolean> {
  const session = input.dialogSession.current;
  const taskTargets =
    input.inFlightMoves.current.get(taskId) ?? new Set<string>();
  if (taskTargets.has(column.id)) return false;
  taskTargets.add(column.id);
  input.inFlightMoves.current.set(taskId, taskTargets);
  try {
    const result = await input.apply(
      [
        {
          kind: 'task.move',
          id: taskId,
          columnId: column.id,
          status: { kind: state },
        },
      ],
      () => session === input.dialogSession.current,
    );
    return result.ok;
  } finally {
    releaseInFlightMove(input, taskId, column.id);
  }
}
function releaseInFlightMove(
  input: ActionsInput,
  taskId: string,
  columnId: string,
): void {
  const taskTargets = input.inFlightMoves.current.get(taskId);
  if (!taskTargets) return;
  taskTargets.delete(columnId);
  if (taskTargets.size === 0) input.inFlightMoves.current.delete(taskId);
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
  const taskTargets =
    input.inFlightMoves.current.get(waitingMove.taskId) ?? new Set<string>();
  if (
    input.dialogSubmission.current === session ||
    taskTargets.has(waitingMove.columnId)
  )
    return;
  taskTargets.add(waitingMove.columnId);
  input.inFlightMoves.current.set(waitingMove.taskId, taskTargets);
  input.dialogSubmission.current = session;
  input.setDialogError('');
  const status = input.waitingUntil
    ? { kind: 'waiting' as const, reason, until: input.waitingUntil }
    : { kind: 'waiting' as const, reason };
  try {
    const result = await input.apply(
      [
        {
          kind: 'task.move',
          id: waitingMove.taskId,
          columnId: waitingMove.columnId,
          status,
        },
      ],
      () => session === input.dialogSession.current,
    );
    if (session !== input.dialogSession.current) return;
    if (result.ok) {
      input.dialogSession.current += 1;
      input.setWaitingMove(undefined);
    } else {
      input.setDialogError(result.message);
    }
  } finally {
    if (input.dialogSubmission.current === session)
      input.dialogSubmission.current = undefined;
    releaseInFlightMove(input, waitingMove.taskId, waitingMove.columnId);
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
  if (!name) {
    input.setDialogError('Введите название колонки.');
    return;
  }
  const session = input.dialogSession.current;
  if (input.dialogSubmission.current === session) return;
  input.dialogSubmission.current = session;
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
  try {
    const result = await input.apply(
      [command],
      () => session === input.dialogSession.current,
    );
    if (session !== input.dialogSession.current) return;
    if (result.ok) {
      input.dialogSession.current += 1;
      input.setEditingColumn(undefined);
      input.setCreatingColumn(false);
    } else {
      input.setDialogError(result.message);
    }
  } finally {
    if (input.dialogSubmission.current === session)
      input.dialogSubmission.current = undefined;
  }
}

async function deleteBoardColumn(
  input: ActionsInput,
  columnId = input.deletingId,
): Promise<boolean> {
  const snapshot = input.snapshot;
  if (!snapshot || !columnId) return false;
  const hasTasks = snapshot.tasks.some((task) => task.columnId === columnId);
  const waiting = waitingDetailsForDelete(input, snapshot, hasTasks);
  if (!waiting.ok) return false;
  const session = input.dialogSession.current;
  if (input.dialogSubmission.current === session) return false;
  input.dialogSubmission.current = session;
  input.setDialogError('');
  const command: CommandsApplyRequest['commands'][number] = {
    kind: 'column.delete',
    id: columnId,
    ...(hasTasks ? { targetColumnId: input.deleteTarget } : {}),
    ...(waiting.details ? { waiting: waiting.details } : {}),
  };
  let result: ApplyResult;
  try {
    result = await input.apply(
      [command],
      () => session === input.dialogSession.current,
    );
  } finally {
    if (input.dialogSubmission.current === session)
      input.dialogSubmission.current = undefined;
  }
  return completeColumnDelete(input, session, result);
}

type WaitingDeleteDetails = {
  reason: string;
  until?: string;
};
type WaitingDeleteResult =
  { ok: true; details?: WaitingDeleteDetails } | { ok: false };

function waitingDetailsForDelete(
  input: ActionsInput,
  snapshot: IpcSnapshot,
  hasTasks: boolean,
): WaitingDeleteResult {
  if (hasTasks && !input.deleteTarget) return { ok: false };
  const waitingTarget =
    hasTasks &&
    snapshot.columns.some(
      (column) =>
        column.id === input.deleteTarget && column.state === 'waiting',
    );
  if (!waitingTarget) return { ok: true };
  const reason = input.waitingReason.trim();
  if (!reason) {
    input.setDialogError('Укажите причину ожидания.');
    return { ok: false };
  }
  return {
    ok: true,
    details: {
      reason,
      ...(input.waitingUntil ? { until: input.waitingUntil } : {}),
    },
  };
}

function completeColumnDelete(
  input: ActionsInput,
  session: number,
  result: ApplyResult,
): boolean {
  if (session !== input.dialogSession.current) return false;
  if (!result.ok) {
    input.setDialogError(result.message);
    return false;
  }
  input.dialogSession.current += 1;
  input.setDeletingId(undefined);
  input.setWaitingReason('');
  input.setWaitingUntil('');
  input.setDeleteTarget('');
  return true;
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
