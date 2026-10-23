import React from 'react';

interface BackupRestoreConfirmationProps {
  readonly isOpen: boolean;
  readonly isRestoring: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function BackupRestoreConfirmation({
  isOpen,
  isRestoring,
  onConfirm,
  onClose,
}: BackupRestoreConfirmationProps): React.JSX.Element {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);
  const cancel = (): void => {
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="quick-dialog"
      aria-labelledby="backup-confirm-heading"
      onCancel={(event) => {
        if (isRestoring) event.preventDefault();
      }}
      onClose={onClose}
    >
      <h2 id="backup-confirm-heading">Подтвердите восстановление</h2>
      <p>Резервная копия проверена: пакет корректен.</p>
      <p>
        Текущие данные будут заменены. Перед восстановлением сохранится копия с
        суффиксом before-restore.
      </p>
      <p>
        Если восстановление завершится ошибкой, текущие данные не изменятся.
      </p>
      {isRestoring && <p role="status">Восстанавливаем данные…</p>}
      <div className="dialog-actions">
        <button
          className="button"
          type="button"
          disabled={isRestoring}
          onClick={cancel}
        >
          Отмена
        </button>
        <button
          className="button"
          type="button"
          disabled={isRestoring}
          onClick={onConfirm}
        >
          Восстановить данные
        </button>
      </div>
    </dialog>
  );
}
