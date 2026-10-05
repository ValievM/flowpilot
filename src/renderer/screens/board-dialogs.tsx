import React from 'react';
import type { IpcSnapshot } from '../../shared/contracts';
import { BoardModal } from './board-modal';

type Column = IpcSnapshot['columns'][number];
type DialogProps = {
  columns: readonly Column[];
  editing: Column | undefined;
  creating: boolean;
  deletingId: string | undefined;
  deleteTarget: string;
  waiting: boolean;
  waitingReason: string;
  waitingUntil: string;
  error: string;
  onSaveColumn: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onCancelColumn: () => void;
  onDeleteTarget: (value: string) => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  onWaitingReason: (value: string) => void;
  onWaitingUntil: (value: string) => void;
  onConfirmWaiting: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onCancelWaiting: () => void;
};

export function BoardDialogs(props: DialogProps): React.JSX.Element {
  return (
    <>
      <ColumnDialog
        editing={props.editing}
        creating={props.creating}
        error={props.error}
        onSave={props.onSaveColumn}
        onCancel={props.onCancelColumn}
      />
      <DeleteDialog
        columns={props.columns}
        deletingId={props.deletingId}
        target={props.deleteTarget}
        error={props.error}
        onTarget={props.onDeleteTarget}
        onDelete={props.onDelete}
        onCancel={props.onCancelDelete}
      />
      <WaitingDialog
        open={props.waiting}
        reason={props.waitingReason}
        until={props.waitingUntil}
        error={props.error}
        onReason={props.onWaitingReason}
        onUntil={props.onWaitingUntil}
        onConfirm={props.onConfirmWaiting}
        onCancel={props.onCancelWaiting}
      />
    </>
  );
}

function ColumnDialog({
  editing,
  creating,
  error,
  onSave,
  onCancel,
}: {
  editing: Column | undefined;
  creating: boolean;
  error: string;
  onSave: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}): React.JSX.Element | null {
  if (!creating && !editing) return null;
  return (
    <BoardModal labelledBy="column-heading" onCancel={onCancel}>
      <form onSubmit={onSave}>
        <h2 id="column-heading">
          {editing ? 'Изменить колонку' : 'Новая колонка'}
        </h2>
        <DialogFeedback error={error} />
        <ColumnFields editing={editing} />
        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Отмена
          </button>
          <button className="button" type="submit">
            Сохранить
          </button>
        </div>
      </form>
    </BoardModal>
  );
}

function ColumnFields({
  editing,
}: {
  editing: Column | undefined;
}): React.JSX.Element {
  return (
    <>
      <label htmlFor="column-name">Название</label>
      <input
        id="column-name"
        name="name"
        required
        maxLength={300}
        defaultValue={editing?.name}
        aria-describedby="column-name-help"
      />
      <p id="column-name-help" className="helper-text">
        Короткое название помогает ориентироваться на доске.
      </p>
      <label htmlFor="column-description">Описание</label>
      <textarea
        id="column-description"
        name="description"
        defaultValue={editing?.description}
      />
      {!editing && <ColumnStateField />}
    </>
  );
}

function ColumnStateField(): React.JSX.Element {
  return (
    <>
      <label htmlFor="column-state">Смысл состояния</label>
      <select id="column-state" name="state">
        <option value="todo">Сделать</option>
        <option value="doing">Делаю</option>
        <option value="waiting">Ожидание</option>
        <option value="done">Готово</option>
      </select>
    </>
  );
}

function DeleteDialog({
  columns,
  deletingId,
  target,
  error,
  onTarget,
  onDelete,
  onCancel,
}: {
  columns: readonly Column[];
  deletingId: string | undefined;
  target: string;
  error: string;
  onTarget: (value: string) => void;
  onDelete: () => void;
  onCancel: () => void;
}): React.JSX.Element | null {
  if (!deletingId) return null;
  return (
    <BoardModal labelledBy="delete-heading" onCancel={onCancel}>
      <h2 id="delete-heading">Удалить колонку?</h2>
      <DialogFeedback error={error} />
      <p>Карточки будут перемещены в выбранную колонку.</p>
      <label htmlFor="delete-target">Переместить карточки в</label>
      <select
        id="delete-target"
        value={target}
        onChange={(event) => {
          onTarget(event.target.value);
        }}
      >
        <option value="">Выберите колонку</option>
        {columns
          .filter((item) => item.id !== deletingId)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </select>
      <div className="dialog-actions">
        <button className="text-button" onClick={onCancel}>
          Отмена
        </button>
        <button className="button" disabled={!target} onClick={onDelete}>
          Удалить колонку
        </button>
      </div>
    </BoardModal>
  );
}

function WaitingDialog({
  open,
  reason,
  until,
  error,
  onReason,
  onUntil,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  reason: string;
  until: string;
  error: string;
  onReason: (value: string) => void;
  onUntil: (value: string) => void;
  onConfirm: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}): React.JSX.Element | null {
  if (!open) return null;
  return (
    <BoardModal labelledBy="waiting-heading" onCancel={onCancel}>
      <form onSubmit={onConfirm}>
        <h2 id="waiting-heading">Почему задача ожидает?</h2>
        <DialogFeedback error={error} />
        <WaitingFields
          reason={reason}
          until={until}
          onReason={onReason}
          onUntil={onUntil}
        />
        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={onCancel}>
            Отмена
          </button>
          <button className="button" type="submit" disabled={!reason.trim()}>
            Переместить
          </button>
        </div>
      </form>
    </BoardModal>
  );
}

function WaitingFields({
  reason,
  until,
  onReason,
  onUntil,
}: {
  reason: string;
  until: string;
  onReason: (value: string) => void;
  onUntil: (value: string) => void;
}): React.JSX.Element {
  return (
    <>
      <label htmlFor="waiting-reason">
        Причина <span>обязательно</span>
      </label>
      <textarea
        id="waiting-reason"
        value={reason}
        onChange={(event) => {
          onReason(event.target.value);
        }}
        required
        aria-describedby="waiting-help"
      />
      <p id="waiting-help" className="helper-text">
        Например, от кого или чего зависит продолжение.
      </p>
      <label htmlFor="waiting-until">
        Срок ожидания <span>необязательно</span>
      </label>
      <input
        id="waiting-until"
        type="date"
        value={until}
        onChange={(event) => {
          onUntil(event.target.value);
        }}
      />
    </>
  );
}

function DialogFeedback({
  error,
}: {
  error: string;
}): React.JSX.Element | null {
  if (!error) return null;
  return (
    <p role="alert" className="board-error">
      {error}
    </p>
  );
}
