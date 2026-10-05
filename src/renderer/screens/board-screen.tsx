import React from 'react';
import type { IpcSnapshot } from '../../shared/contracts';
import { BoardColumns } from './board-columns';
import { BoardDialogs } from './board-dialogs';
import { useBoardActions } from './use-board-actions';
import type { BoardActions } from './use-board-actions';
import { useBoardSnapshot } from './use-board-snapshot';
import type { BoardSnapshotState } from './use-board-snapshot';

type Column = IpcSnapshot['columns'][number];
type WaitingMove = { taskId: string; columnId: string };
type BoardUiState = {
  waitingMove: WaitingMove | undefined;
  setWaitingMove: (value: WaitingMove | undefined) => void;
  waitingReason: string;
  setWaitingReason: (value: string) => void;
  waitingUntil: string;
  setWaitingUntil: (value: string) => void;
  editingColumn: Column | undefined;
  setEditingColumn: (value: Column | undefined) => void;
  creatingColumn: boolean;
  setCreatingColumn: (value: boolean) => void;
  deletingId: string | undefined;
  setDeletingId: (value: string | undefined) => void;
  deleteTarget: string;
  setDeleteTarget: (value: string) => void;
};

type BoardWorkspaceProps = {
  data: BoardSnapshotState;
  ui: BoardUiState;
  actions: BoardActions;
};

type BoardPartProps = {
  snapshot: IpcSnapshot;
  ui: BoardUiState;
  actions: BoardActions;
};

export function BoardScreen(): React.JSX.Element {
  const data = useBoardSnapshot();
  const ui = useBoardUiState();
  const actions = useBoardActions({
    snapshot: data.snapshot,
    apply: data.apply,
    ...ui,
  });
  if (data.loading && !data.snapshot) return <BoardLoading />;
  if (!data.snapshot) {
    return <BoardLoadFailure error={data.error} onRetry={data.retry} />;
  }
  return <BoardWorkspace data={data} ui={ui} actions={actions} />;
}

function useBoardUiState(): BoardUiState {
  const [waitingMove, setWaitingMove] = React.useState<WaitingMove>();
  const [waitingReason, setWaitingReason] = React.useState('');
  const [waitingUntil, setWaitingUntil] = React.useState('');
  const [editingColumn, setEditingColumn] = React.useState<Column>();
  const [creatingColumn, setCreatingColumn] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string>();
  const [deleteTarget, setDeleteTarget] = React.useState('');
  return {
    waitingMove,
    setWaitingMove,
    waitingReason,
    setWaitingReason,
    waitingUntil,
    setWaitingUntil,
    editingColumn,
    setEditingColumn,
    creatingColumn,
    setCreatingColumn,
    deletingId,
    setDeletingId,
    deleteTarget,
    setDeleteTarget,
  };
}

function BoardWorkspace({
  data,
  ui,
  actions,
}: BoardWorkspaceProps): React.JSX.Element {
  const snapshot = data.snapshot;
  if (!snapshot) return <BoardLoading />;
  return (
    <section className="simple-screen board-screen" aria-busy={data.loading}>
      <BoardHeader ui={ui} notice={data.notice} loading={data.loading} />
      <BoardMessages data={data} />
      <BoardTaskColumns snapshot={snapshot} ui={ui} actions={actions} />
      <BoardDialogWorkspace snapshot={snapshot} ui={ui} actions={actions} />
    </section>
  );
}

function BoardTaskColumns({
  snapshot,
  ui,
  actions,
}: BoardPartProps): React.JSX.Element {
  return (
    <BoardColumns
      snapshot={snapshot}
      onMove={(id, column) => void actions.move(id, column)}
      onRename={ui.setEditingColumn}
      onDelete={(column, hasTasks) => {
        ui.setDeletingId(column.id);
        ui.setDeleteTarget('');
        if (!hasTasks) void actions.deleteColumn(column.id);
      }}
    />
  );
}

function BoardDialogWorkspace({
  snapshot,
  ui,
  actions,
}: BoardPartProps): React.JSX.Element {
  return (
    <BoardDialogs
      columns={snapshot.columns}
      editing={ui.editingColumn}
      creating={ui.creatingColumn}
      deletingId={ui.deletingId}
      deleteTarget={ui.deleteTarget}
      waiting={Boolean(ui.waitingMove)}
      waitingReason={ui.waitingReason}
      waitingUntil={ui.waitingUntil}
      onSaveColumn={(event) => void actions.saveColumn(event)}
      onCancelColumn={() => {
        ui.setEditingColumn(undefined);
        ui.setCreatingColumn(false);
      }}
      onDeleteTarget={ui.setDeleteTarget}
      onDelete={() => void actions.deleteColumn()}
      onCancelDelete={() => {
        ui.setDeletingId(undefined);
        ui.setDeleteTarget('');
      }}
      onWaitingReason={ui.setWaitingReason}
      onWaitingUntil={ui.setWaitingUntil}
      onConfirmWaiting={(event) => void actions.confirmWaiting(event)}
      onCancelWaiting={() => {
        ui.setWaitingMove(undefined);
      }}
    />
  );
}

function BoardHeader({
  ui,
  notice,
  loading,
}: {
  ui: BoardUiState;
  notice: string;
  loading: boolean;
}): React.JSX.Element {
  return (
    <>
      <p className="eyebrow">ЛИЧНОЕ / ДОСКА</p>
      <div className="board-title">
        <h1>Доска</h1>
        <button
          className="button"
          onClick={() => {
            ui.setEditingColumn(undefined);
            ui.setCreatingColumn(true);
          }}
        >
          Добавить колонку
        </button>
      </div>
      {(loading || notice) && (
        <p role="status" className="board-notice">
          {loading ? 'Обновление доски…' : notice}
        </p>
      )}
    </>
  );
}

function BoardMessages({
  data,
}: {
  data: BoardSnapshotState;
}): React.JSX.Element {
  if (!data.snapshot) return <></>;
  return (
    <>
      {data.error && (
        <p role="alert" className="board-error">
          {data.error}
        </p>
      )}
      {!data.snapshot.tasks.length && (
        <p className="board-empty">
          На доске пока нет задач. Создайте задачу, чтобы она появилась здесь.
        </p>
      )}
    </>
  );
}

function BoardLoading(): React.JSX.Element {
  return (
    <section className="simple-screen" aria-busy="true">
      <h1>Доска</h1>
      <p role="status">Загрузка доски…</p>
    </section>
  );
}

function BoardLoadFailure({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <section className="simple-screen">
      <h1>Доска</h1>
      <p role="alert">{error}</p>
      <button className="button" onClick={onRetry}>
        Повторить
      </button>
    </section>
  );
}
