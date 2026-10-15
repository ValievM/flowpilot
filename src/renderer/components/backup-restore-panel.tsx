import React from 'react';
import type {
  BackupVerifyResult,
  FlowPilotApi,
  IpcSnapshot,
} from '../../shared/contracts';
import { BackupRestoreFeedback } from './backup-restore-feedback';
import { BackupExportControl } from './backup-export-control';
import { BackupRestoreConfirmation } from './backup-restore-confirmation';

interface BackupRestorePanelProps {
  readonly backup: Pick<
    FlowPilotApi['backup'],
    'export' | 'verify' | 'restore'
  >;
  readonly onRestored: () => Promise<IpcSnapshot | undefined>;
}

type RestorePhase = 'idle' | 'verifying' | 'confirming' | 'restoring';
type BackupProblem = Extract<
  BackupVerifyResult,
  { readonly ok: false; readonly error: 'PackageInvalid' }
>['problems'][number];

export function BackupRestorePanel({
  backup,
  onRestored,
}: BackupRestorePanelProps): React.JSX.Element {
  const [phase, setPhase] = React.useState<RestorePhase>('idle');
  const [packageToken, setPackageToken] = React.useState<string>();
  const [problems, setProblems] = React.useState<readonly BackupProblem[]>([]);
  const [error, setError] = React.useState<string>();
  const [notice, setNotice] = React.useState<string>();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const busyRef = React.useRef(false);
  const restoreStartedRef = React.useRef(false);
  const restoreFocusRef = React.useRef(false);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    if (phase === 'idle' && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [phase]);

  const handleVerify = async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('verifying');
    setError(undefined);
    setNotice(undefined);
    setProblems([]);
    let needsConfirmation = false;
    try {
      const result = await backup.verify();
      if (!result.ok) {
        if (result.error === 'PackageInvalid') {
          setProblems(result.problems);
          setError(
            result.problems.length === 0
              ? 'Не удалось проверить резервную копию. Данные не изменены.'
              : undefined,
          );
        }
        if (result.error === 'ValidationFailed')
          setError('Не удалось проверить резервную копию. Данные не изменены.');
        return;
      }
      setPackageToken(result.value.packageToken);
      setPhase('confirming');
      needsConfirmation = true;
    } catch {
      setError('Не удалось проверить резервную копию. Данные не изменены.');
    } finally {
      if (!needsConfirmation) {
        busyRef.current = false;
        setPhase('idle');
      }
    }
  };

  const handleRestore = async (): Promise<void> => {
    if (!packageToken || !busyRef.current || restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    setPhase('restoring');
    setError(undefined);
    try {
      const result = await backup.restore(packageToken);
      if (!result.ok) {
        setError('Не удалось восстановить данные. Данные не изменены.');
        return;
      }
      const snapshot = await onRestored();
      if (!snapshot) {
        setError(
          'Восстановление завершено, но не удалось загрузить актуальные данные.',
        );
        return;
      }
      setNotice('Данные восстановлены.');
    } catch {
      setError('Не удалось восстановить данные. Данные не изменены.');
    } finally {
      busyRef.current = false;
      restoreStartedRef.current = false;
      setPhase('idle');
    }
  };

  const closeConfirmation = (): void => {
    if (restoreStartedRef.current) return;
    busyRef.current = false;
    restoreStartedRef.current = false;
    restoreFocusRef.current = true;
    setPackageToken(undefined);
    setPhase('idle');
  };

  return (
    <section
      className="settings-card backup-settings"
      aria-labelledby="backup-heading"
    >
      <h2 id="backup-heading">Данные</h2>
      <p>
        Восстановление заменит текущие данные только после проверки резервной
        копии и вашего подтверждения.
      </p>
      <BackupExportControl
        backup={backup}
        disabled={phase !== 'idle'}
        onExportingChange={setExporting}
      />
      <button
        ref={triggerRef}
        className="button"
        type="button"
        disabled={phase !== 'idle' || exporting}
        onClick={() => void handleVerify()}
      >
        {phase === 'verifying'
          ? 'Проверяем резервную копию…'
          : 'Восстановить из папки'}
      </button>
      <BackupRestoreFeedback
        problems={problems}
        error={error}
        notice={notice}
      />
      <BackupRestoreConfirmation
        isOpen={phase === 'confirming' || phase === 'restoring'}
        isRestoring={phase === 'restoring'}
        onConfirm={() => void handleRestore()}
        onClose={closeConfirmation}
      />
    </section>
  );
}
