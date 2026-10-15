import React from 'react';
import type { AttachmentMetadata, Task } from '../../domain';
import type { FlowPilotApi } from '../../shared/contracts';
import type { PersistedState } from '../use-persisted-tasks';

const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;

export function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${String(sizeBytes)} Б`;
  const megabytes = sizeBytes / (1024 * 1024);
  if (megabytes >= 1)
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(megabytes)} МБ`;
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(sizeBytes / 1024)} КБ`;
}

function attachmentErrorMessage(error: string): string {
  switch (error) {
    case 'FileNotFound':
      return 'Файл не найден. Выберите доступный файл и попробуйте снова.';
    case 'TooLarge':
      return `Файл превышает лимит ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`;
    case 'NotReadable':
      return 'Не удалось прочитать файл. Проверьте доступ к нему и попробуйте снова.';
    case 'MissingFile':
      return 'Файл исчез с диска. Запись сохранена; его можно удалить.';
    default:
      return 'Не удалось выполнить действие с файлом. Попробуйте снова.';
  }
}

export function TaskAttachments({
  task,
  refresh,
  api = window.flowpilot,
}: {
  readonly task: Task;
  readonly refresh: PersistedState['refresh'];
  readonly api?: FlowPilotApi;
}): React.JSX.Element {
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const addAttachment = async (): Promise<void> => {
    setBusy(true);
    setMessage('');
    try {
      const result = await api.attachments.add({ taskId: task.id });
      if (!result.ok) {
        if (result.error !== 'Cancelled')
          setMessage(attachmentErrorMessage(result.error));
      } else {
        await refresh();
      }
    } catch {
      setMessage('Не удалось добавить файл. Попробуйте снова.');
    }
    setBusy(false);
  };

  const openAttachment = async (attachmentId: string): Promise<void> => {
    setMessage('');
    try {
      const result = await api.attachments.open({ attachmentId });
      if (!result.ok) setMessage(attachmentErrorMessage(result.error));
    } catch {
      setMessage('Не удалось открыть файл. Попробуйте снова.');
    }
  };

  const removeAttachment = async (
    attachment: AttachmentMetadata,
  ): Promise<void> => {
    if (!window.confirm(`Удалить файл «${attachment.name}» из задачи?`)) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await api.attachments.remove({
        attachmentId: attachment.id,
      });
      if (!result.ok) {
        setMessage(attachmentErrorMessage(result.error));
      } else {
        await refresh();
      }
    } catch {
      setMessage('Не удалось удалить файл. Попробуйте снова.');
    }
    setBusy(false);
  };

  return (
    <section className="task-card-section" aria-label="Файлы">
      <div className="task-attachments-heading">
        <h2>Файлы</h2>
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => void addAttachment()}
        >
          Добавить файл
        </button>
      </div>
      <p className="task-attachments-note">
        Содержимое файла приложение само не читает.
      </p>
      {task.attachments.length > 0 ? (
        <ul className="task-attachments-list">
          {task.attachments.map((attachment) => (
            <li className="task-attachment" key={attachment.id}>
              <div className="task-attachment-info">
                <strong>{attachment.name}</strong>
                <span>
                  {formatAttachmentSize(attachment.sizeBytes)} ·{' '}
                  {attachment.mediaType || 'Тип не указан'}
                </span>
              </div>
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => void openAttachment(attachment.id)}
              >
                Открыть
              </button>
              <button
                className="button icon-button"
                type="button"
                aria-label={`Удалить файл ${attachment.name}`}
                disabled={busy}
                onClick={() => void removeAttachment(attachment)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="task-attachments-empty">Пока нет файлов.</p>
      )}
      <p
        className="task-attachments-message"
        role="alert"
        aria-live="assertive"
      >
        {message}
      </p>
    </section>
  );
}
