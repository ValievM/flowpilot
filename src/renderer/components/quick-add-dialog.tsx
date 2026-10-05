import React from 'react';

interface QuickAddDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (title: string) => Promise<boolean>;
  addButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function QuickAddDialog({
  open,
  onClose,
  onSubmit,
  addButtonRef,
}: QuickAddDialogProps): React.JSX.Element {
  const [title, setTitle] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      dialogRef.current?.querySelector('input')?.focus();
    } else if (dialogRef.current?.open) dialogRef.current.close();
  }, [open]);

  const submitTask = async (
    event: React.SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;
    setSubmitting(true);
    setError(undefined);
    const saved = await onSubmit(trimmedTitle);
    setSubmitting(false);
    if (!saved) {
      setError(
        'Не удалось сохранить задачу. Текст не потерян — попробуйте снова.',
      );
      return;
    }
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
      <form
        onSubmit={(event) => {
          void submitTask(event);
        }}
      >
        <label htmlFor="new-task-title">Что нужно сделать?</label>
        <input
          id="new-task-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(undefined);
          }}
          placeholder="Например, подготовить вопросы к семинару"
          required
          autoComplete="off"
          aria-describedby="new-task-help"
          aria-invalid={Boolean(error)}
        />
        <p className="helper-text" id="new-task-help">
          Задача сохранится в «Сделать» на сегодня. Срок и подробности можно
          добавить позже.
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button"
            type="button"
            onClick={onClose}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={!title.trim() || submitting}
          >
            {submitting ? 'Сохраняем…' : 'Добавить задачу'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
