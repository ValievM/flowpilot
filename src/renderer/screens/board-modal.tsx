import React from 'react';

type BoardModalProps = {
  labelledBy: string;
  onCancel: () => void;
  children: React.ReactNode;
};

export function BoardModal({
  labelledBy,
  onCancel,
  children,
}: BoardModalProps): React.JSX.Element {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const previousFocus = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>('input, select, textarea, button')
      ?.focus();
    return () => {
      if (dialog.open) dialog.close();
      const target = previousFocus.current;
      if (target?.isConnected) target.focus();
      else {
        document
          .querySelector<HTMLElement>('[data-board-dialog-focus-fallback]')
          ?.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="board-dialog"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {children}
    </dialog>
  );
}
