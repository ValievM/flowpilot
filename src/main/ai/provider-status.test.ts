import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Repository } from '../../storage';
import {
  codexCheckFor,
  currentChoice,
  getAiProviderStatus,
} from './provider-status';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function open(): Repository {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-provider-'));
  directories.push(directory);
  return new Repository(join(directory, 'tasks.sqlite'), {
    now: () => Temporal.Instant.from('2026-10-05T12:00:00Z'),
  });
}

describe('AI provider status', () => {
  it('defaults to manual exchange and follows the stored choice', () => {
    const repository = open();
    expect(currentChoice(repository)).toBe('manual');
    expect(currentChoice(undefined)).toBe('manual');
    repository.apply(
      [{ kind: 'setting.set', key: 'aiProvider', value: 'codex' }],
      0,
    );
    expect(currentChoice(repository)).toBe('codex');
  });

  it('lets the renderer choose only a known provider', () => {
    const repository = open();
    const bad = repository.apply(
      [{ kind: 'setting.set', key: 'aiProvider', value: 'whatever' }],
      0,
    );
    expect(bad.ok).toBe(false);
  });

  it('reports the choice and Codex readiness without asking Codex anything', async () => {
    const repository = open();
    const checkCodex = vi.fn(() =>
      Promise.resolve({ installed: true, loggedIn: true }),
    );
    expect(await getAiProviderStatus({}, { repository, checkCodex })).toEqual({
      ok: true,
      value: { provider: 'manual', codex: { installed: true, loggedIn: true } },
    });
    expect(
      await getAiProviderStatus({ x: 1 }, { repository, checkCodex }),
    ).toEqual({
      ok: false,
      error: 'ValidationFailed',
    });
  });
});

describe('Codex check in test builds', () => {
  it('is a fixed answer in an unpackaged test build, and the real check otherwise', async () => {
    const real = vi.fn(() =>
      Promise.resolve({ installed: true, loggedIn: true }),
    );
    expect(await codexCheckFor(false, { FLOWPILOT_TEST: '1' }, real)()).toEqual(
      {
        installed: false,
        loggedIn: false,
      },
    );
    expect(
      await codexCheckFor(
        false,
        { FLOWPILOT_TEST: '1', FLOWPILOT_TEST_CODEX: 'ready' },
        real,
      )(),
    ).toEqual({ installed: true, loggedIn: true });
    expect(real).not.toHaveBeenCalled();
    await codexCheckFor(true, { FLOWPILOT_TEST: '1' }, real)();
    await codexCheckFor(false, {}, real)();
    expect(real).toHaveBeenCalledTimes(2);
  });
});
