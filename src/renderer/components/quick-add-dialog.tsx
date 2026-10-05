import React from 'react';

interface QuickAddDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (title: string) => void;
  addButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function QuickAddDialog({
  open,
  onClose,
  onSubmit,
  addButtonRef,
}: QuickAddDialogProps): React.JSX.Element {
  const [title, setTitle] = React.useState('');
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      dialogRef.current?.querySelector('input')?.focus();
    } else if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [open]);

  const submitTask = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onSubmit(trimmedTitle);
    setTitle('');
    onClose();
    addButtonRef.current?.focus();
  };

  return (
    <dialog
      className="quick-dialog"
      ref={dialogRef}
      aria-labelledby="quick-title"
      onClose={() => {
        onClose();
        addButtonRef.current?.focus();
      }}
    >
      <div className="dialog-heading">
        <h2 id="quick-title">Новая задача</h2>
        <button
          className="button icon-button"
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form onSubmit={submitTask}>
        <label htmlFor="new-task-title">Что нужно сделать?</label>
        <input
          id="new-task-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          placeholder="Например, подготовить вопросы к семинару"
          required
          autoComplete="off"
        />
        <p className="helper-text">
          Достаточно названия. Срок и подробности можно добавить позже.
        </p>
        <div className="dialog-actions">
          <button className="button" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="button button-primary" type="submit">
            Добавить задачу
          </button>
        </div>
      </form>
    </dialog>
  );
}
