import React from 'react';
import type { FlowPilotApi } from '../../shared/contracts';

interface BackupExportControlProps {
  readonly backup: Pick<FlowPilotApi['backup'], 'export'>;
  readonly disabled: boolean;
  readonly onExportingChange: (exporting: boolean) => void;
}

export function BackupExportControl({
  backup,
  disabled,
  onExportingChange,
}: BackupExportControlProps): React.JSX.Element {
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();

  const handleExport = async (): Promise<void> => {
    if (disabled || exporting) return;
    setExporting(true);
    onExportingChange(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await backup.export();
      if (!result.ok) {
        if (result.error === 'Cancelled') return;
        setError(
          result.error === 'AlreadyExists'
            ? 'Папка уже существует. Выберите другую папку для экспорта.'
            : 'Не удалось экспортировать данные.',
        );
        return;
      }
      const exportedAt = new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(result.value.exportedAt));
      setNotice(
        `Резервная копия сохранена: ${result.value.folderPath} (${exportedAt}).`,
      );
    } catch {
      setError('Не удалось экспортировать данные.');
    } finally {
      setExporting(false);
      onExportingChange(false);
    }
  };

  return (
    <>
      <button
        className="button"
        type="button"
        disabled={disabled || exporting}
        onClick={() => void handleExport()}
      >
        {exporting ? 'Экспортируем…' : 'Экспортировать'}
      </button>
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
