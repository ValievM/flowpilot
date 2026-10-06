import { describe, expect, it } from 'vitest';
import { ForeignDatabaseError } from '../storage/migrate';
import { reportStartupFailure, startupDiagnostic } from './startup-error';

describe('startup diagnostics', () => {
  it('shows actionable foreign-database guidance without exposing profile data', () => {
    const diagnostic = startupDiagnostic(new ForeignDatabaseError());

    expect(diagnostic.title).toBe('Не удалось запустить FlowPilot');
    expect(diagnostic.message).toContain(
      'Папка данных занята другой версией FlowPilot',
    );
    expect(diagnostic.message).toContain('Закройте другие версии приложения');
    expect(diagnostic.logCode).toBe('FOREIGN_DATABASE');
    expect(diagnostic.message).not.toContain('/');
  });

  it('logs and shows the diagnostic before quitting after a startup failure', () => {
    const error = new ForeignDatabaseError();
    const expected = startupDiagnostic(error);
    const events: string[] = [];
    let shown: { title: string; message: string } | undefined;

    reportStartupFailure(error, {
      logFailure: (code) => events.push(`log:${code}`),
      showErrorBox: (title, message) => {
        events.push('dialog');
        shown = { title, message };
      },
      quit: () => events.push('quit'),
    });

    expect(events).toEqual(['log:FOREIGN_DATABASE', 'dialog', 'quit']);
    expect(shown).toEqual({
      title: expected.title,
      message: expected.message,
    });
  });

  it('shows a safe actionable cause instead of exposing unexpected error details', () => {
    const diagnostic = startupDiagnostic(
      new Error('profile sentinel: access denied'),
    );

    expect(diagnostic.message).toContain(
      'Проверьте, что у FlowPilot есть доступ',
    );
    expect(diagnostic.message).not.toContain('profile sentinel');
    expect(diagnostic.message).not.toContain('access denied');
    expect(diagnostic.logCode).toBe('STARTUP_FAILED');
  });
});
