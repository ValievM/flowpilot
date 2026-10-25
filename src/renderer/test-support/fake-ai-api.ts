import type { FlowPilotApi } from '../../shared/flowpilot-api';

export const fakeAiApi: FlowPilotApi['ai'] = {
  scenario: () =>
    Promise.resolve({
      ok: false,
      error: {
        kind: 'ProviderUnavailable',
        message: 'AI is unavailable in this test.',
      },
    }),
  run: () => Promise.resolve({ ok: false, error: 'ProviderUnavailable' }),
  cancel: () => Promise.resolve({ ok: false, error: 'ValidationFailed' }),
  prompt: () => Promise.resolve({ ok: false, error: 'NotFound' }),
  pending: () => Promise.resolve({ ok: true, value: [] }),
  providerStatus: () =>
    Promise.resolve({
      ok: true,
      value: {
        provider: 'manual',
        codex: { installed: false, loggedIn: false },
      },
    }),
  reply: () => Promise.resolve({ ok: false, error: 'NotFound' }),
};
