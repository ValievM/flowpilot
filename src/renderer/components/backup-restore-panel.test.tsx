import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BackupVerifyResult,
  FlowPilotApi,
  IpcSnapshot,
} from '../../shared/contracts';
import type { Result } from '../../shared/ipc-result';
import { fakeApi } from '../test-support/fake-flowpilot';
import { BackupRestorePanel } from './backup-restore-panel';

if (
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal') ===
  undefined
) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      value(this: HTMLDialogElement): void {
        this.setAttribute('open', '');
      },
    },
    close: {
      value(this: HTMLDialogElement): void {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    },
  });
}

afterEach(cleanup);

const validPackage: BackupVerifyResult = {
  ok: true,
  value: { packageToken: 'verified-token', problems: [] },
};

function renderPanel(
  overrides: Partial<FlowPilotApi['backup']> = {},
  refresh: () => Promise<IpcSnapshot | undefined> = vi.fn(() =>
    Promise.resolve(undefined),
  ),
) {
  const backup: FlowPilotApi['backup'] = {
    ...fakeApi().api.backup,
    verify: vi.fn(() => Promise.resolve(validPackage)),
    restore: vi.fn((token: string) => fakeApi().api.backup.restore(token)),
    ...overrides,
  };
  render(<BackupRestorePanel backup={backup} onRestored={refresh} />);
  return { refresh };
}

describe('backup restore panel', () => {
  it('shows the export destination and time after a successful export', async () => {
    const exportBackup = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          folderPath: '/backups/FlowPilot',
          exportedAt: '2026-10-15T12:00:00.000Z',
        },
      }),
    );
    renderPanel({ export: exportBackup });

    fireEvent.click(screen.getByRole('button', { name: 'Экспортировать' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '/backups/FlowPilot',
    );
    expect(screen.getByRole('status').textContent).toMatch(/15\.10\.2026/);
  });

  it('explains an occupied destination and keeps dialog cancellation silent', async () => {
    const exportBackup = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        error: 'AlreadyExists' as const,
      })
      .mockResolvedValueOnce({
        ok: false as const,
        error: 'Cancelled' as const,
      });
    renderPanel({ export: exportBackup });

    fireEvent.click(screen.getByRole('button', { name: 'Экспортировать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Папка уже существует',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Экспортировать' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('shows verification problems and does not offer restore', async () => {
    const invalidPackage: BackupVerifyResult = {
      ok: false,
      error: 'PackageInvalid',
      problems: [
        {
          path: 'manifest.json',
          message: 'Версия формата новее поддерживаемой',
        },
        { path: 'attachments/a', message: 'Контрольная сумма не совпадает' },
      ],
    };
    renderPanel({ verify: vi.fn(() => Promise.resolve(invalidPackage)) });

    fireEvent.click(
      screen.getByRole('button', { name: 'Восстановить из папки' }),
    );

    expect(
      await screen.findByText(/Версия формата новее поддерживаемой/),
    ).toBeTruthy();
    expect(screen.getByText(/Контрольная сумма не совпадает/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Восстановить данные' }),
    ).toBeNull();
  });

  it('requires confirmation and cancellation never restores or loses focus', async () => {
    const restore = vi.fn((token: string) =>
      fakeApi().api.backup.restore(token),
    );
    renderPanel({ restore });
    const trigger = screen.getByRole('button', {
      name: 'Восстановить из папки',
    });

    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', {
      name: 'Подтвердите восстановление',
    });
    expect(dialog.textContent).toContain(
      'Резервная копия проверена: пакет корректен.',
    );
    expect(dialog.textContent).toContain('Текущие данные будут заменены');
    expect(dialog.textContent).toContain('before-restore');
    fireEvent.click(withinDialogButton(dialog, 'Отмена'));
    expect(restore).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('restores only the verified token and reloads the snapshot after confirmation', async () => {
    const restore = vi.fn((token: string) =>
      fakeApi().api.backup.restore(token),
    );
    const snapshot = await fakeApi().api.snapshot.load();
    if (!snapshot.ok) throw new Error('Missing fake snapshot');
    const refresh = vi.fn(() => Promise.resolve(snapshot.value));
    renderPanel({ restore }, refresh);

    fireEvent.click(
      screen.getByRole('button', { name: 'Восстановить из папки' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Подтвердите восстановление',
    });
    fireEvent.click(withinDialogButton(dialog, 'Восстановить данные'));

    await waitFor(() => {
      expect(restore).toHaveBeenCalledWith('verified-token');
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(await screen.findByText('Данные восстановлены.')).toBeTruthy();
  });
  it('distinguishes a completed restore from a failed snapshot refresh', async () => {
    const refresh = vi.fn(() => Promise.resolve(undefined));
    renderPanel({}, refresh);

    fireEvent.click(
      screen.getByRole('button', { name: 'Восстановить из папки' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Подтвердите восстановление',
    });
    fireEvent.click(withinDialogButton(dialog, 'Восстановить данные'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'не удалось загрузить актуальные данные',
    );
    expect(screen.queryByText('Данные восстановлены.')).toBeNull();
  });

  it('reports restore errors without claiming data changed', async () => {
    const restore = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: 'InternalError' as const }),
    );
    renderPanel({ restore });

    fireEvent.click(
      screen.getByRole('button', { name: 'Восстановить из папки' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Подтвердите восстановление',
    });
    fireEvent.click(withinDialogButton(dialog, 'Восстановить данные'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Данные не изменены',
    );
  });

  it('disables repeated verification while an operation is pending', async () => {
    let finishVerification: ((result: BackupVerifyResult) => void) | undefined;
    const verify = vi.fn(
      () =>
        new Promise<BackupVerifyResult>((resolve) => {
          finishVerification = resolve;
        }),
    );
    renderPanel({ verify });
    const button = screen.getByRole('button', {
      name: 'Восстановить из папки',
    });

    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(verify).toHaveBeenCalledOnce();
    finishVerification?.(validPackage);
    await screen.findByRole('dialog', { name: 'Подтвердите восстановление' });
  });

  it('blocks repeated restore requests while restoring', async () => {
    const snapshotResult = await fakeApi().api.snapshot.load();
    if (!snapshotResult.ok) throw new Error('Missing fake snapshot');
    let finishRestore: ((result: Result<IpcSnapshot>) => void) | undefined;
    const restore = vi.fn(
      () =>
        new Promise<Result<IpcSnapshot>>((resolve) => {
          finishRestore = resolve;
        }),
    );
    const refresh = vi.fn(() => Promise.resolve(snapshotResult.value));
    renderPanel({ restore }, refresh);

    fireEvent.click(
      screen.getByRole('button', { name: 'Восстановить из папки' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Подтвердите восстановление',
    });
    const restoreButton = withinDialogButton(dialog, 'Восстановить данные');
    fireEvent.click(restoreButton);

    expect(restoreButton).toBeDisabled();
    fireEvent.click(restoreButton);
    expect(restore).toHaveBeenCalledOnce();
    finishRestore?.({ ok: true, value: snapshotResult.value });
    await screen.findByText('Данные восстановлены.');
  });
});

function withinDialogButton(dialog: HTMLElement, name: string): HTMLElement {
  const button = Array.from(dialog.querySelectorAll('button')).find(
    (item) => item.textContent === name,
  );
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}
