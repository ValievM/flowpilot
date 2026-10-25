import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiProviderStatus } from '../../shared/ai-provider-contracts';
import type { FlowPilotApi } from '../../shared/flowpilot-api';
import { AiProviderSettings } from './ai-provider-settings';

afterEach(cleanup);

function setup(status: AiProviderStatus) {
  const providerStatus = vi.fn(() =>
    Promise.resolve({ ok: true as const, value: status }),
  );
  window.flowpilot = { ai: { providerStatus } } as unknown as FlowPilotApi;
  const onApply = vi.fn(() => Promise.resolve(true));
  render(<AiProviderSettings onApply={onApply} />);
  return { onApply, providerStatus };
}

const ready = {
  provider: 'manual',
  codex: { installed: true, loggedIn: true },
} as const;

describe('AI provider in settings', () => {
  it('offers manual exchange and Codex, and saves the choice', async () => {
    const { onApply } = setup(ready);
    fireEvent.click(await screen.findByRole('radio', { name: /Codex/ }));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith([
        { kind: 'setting.set', key: 'aiProvider', value: 'codex' },
      ]);
    });
  });

  it('says what to do when Codex is missing or not logged in, and refuses to switch', async () => {
    const missing = setup({
      provider: 'manual',
      codex: { installed: false, loggedIn: false },
    });
    expect(await screen.findByText(/Codex не найден/)).toBeVisible();
    expect(screen.getByRole('radio', { name: /Codex/ })).toBeDisabled();
    cleanup();
    setup({ provider: 'manual', codex: { installed: true, loggedIn: false } });
    expect(await screen.findByText(/codex login/)).toBeVisible();
    expect(screen.getByRole('radio', { name: /Codex/ })).toBeDisabled();
    expect(missing.onApply).not.toHaveBeenCalled();
  });

  it('tells that the request goes out only on the person’s press', async () => {
    setup(ready);
    expect(await screen.findByText(/только по вашему нажатию/)).toBeVisible();
  });
});
