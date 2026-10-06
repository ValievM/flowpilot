import { ForeignDatabaseError } from '../storage/migrate';

export type StartupDiagnostic = Readonly<{
  title: string;
  message: string;
  logCode: 'FOREIGN_DATABASE' | 'STARTUP_FAILED';
}>;
export type StartupErrorEffects = Readonly<{
  logFailure: (code: StartupDiagnostic['logCode']) => void;
  showErrorBox: (title: string, message: string) => void;
  quit: () => void;
}>;

export function reportStartupFailure(
  error: unknown,
  effects: StartupErrorEffects,
): void {
  const diagnostic = startupDiagnostic(error);
  effects.logFailure(diagnostic.logCode);
  effects.showErrorBox(diagnostic.title, diagnostic.message);
  effects.quit();
}

export function startupDiagnostic(error: unknown): StartupDiagnostic {
  if (error instanceof ForeignDatabaseError)
    return {
      title: 'Не удалось запустить FlowPilot',
      message:
        'Папка данных занята другой версией FlowPilot. Не изменяйте эти данные. Закройте другие версии приложения и обратитесь в поддержку, если проблема повторится.',
      logCode: 'FOREIGN_DATABASE',
    };
  return {
    title: 'Не удалось запустить FlowPilot',
    message:
      'Приложение не смогло подготовить данные для запуска. Проверьте, что у FlowPilot есть доступ к папке данных, затем перезапустите приложение. Если ошибка повторится, обратитесь в поддержку.',
    logCode: 'STARTUP_FAILED',
  };
}
