import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import type { NotificationsStatus } from '../../shared/notification-contracts';
import { RemindersSettings } from './reminders-settings';

afterEach(cleanup);

function setup(
  initial: NotificationsStatus,
  afterConfigure?: NotificationsStatus,
) {
  const status = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: initial }),
  );
  const configure = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: afterConfigure ?? initial }),
  );
  window.flowpilot = {
    notifications: { status, configure, onOpen: vi.fn() },
  } as unknown as FlowPilotApi;
  const onApply = vi.fn(() => Promise.resolve(true));
  render(<RemindersSettings onApply={onApply} />);
  return { status, configure, onApply };
}

const base: NotificationsStatus = {
  enabled: false,
  leadMinutes: 10,
  permission: 'unknown',
};

describe('reminders in settings', () => {
  it('never asks macOS for permission just by opening the settings', async () => {
    const { configure } = setup(base);
    expect(await screen.findByText(/ещё не запрашивалось/)).toBeVisible();
    expect(configure).not.toHaveBeenCalled();
  });

  it('asks only when the person presses "Настроить", then shows the answer', async () => {
    const { configure } = setup(base, { ...base, permission: 'granted' });
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить' }));
    await waitFor(() => {
      expect(configure).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/Уведомления разрешены/)).toBeVisible();
  });

  it('says in words that macOS refused, and that tasks stay on the board', async () => {
    setup({ ...base, permission: 'denied' });
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(/macOS не разрешила уведомления/);
    expect(note).toHaveTextContent(/дела остаются на доске/);
  });

  it('switches reminders on and sets the lead time through settings commands', async () => {
    const { onApply } = setup({ ...base, permission: 'granted' });
    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: 'Напоминать о занятиях и делах со временем',
      }),
    );
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'setting.set', key: 'remindersEnabled', value: true },
      ]);
    });
    fireEvent.change(screen.getByLabelText('За сколько минут напомнить'), {
      target: { value: '30' },
    });
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'setting.set', key: 'reminderLeadMinutes', value: 30 },
      ]);
    });
  });
});
