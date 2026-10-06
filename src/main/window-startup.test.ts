import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWindowStartupGate } from './window-startup';

function startupGate() {
  vi.useFakeTimers();
  const reveal = vi.fn();
  const showError = vi.fn();
  const quit = vi.fn();
  const cancel = vi.fn((timer: NodeJS.Timeout) => {
    clearTimeout(timer);
  });
  const gate = createWindowStartupGate({
    reveal,
    showError,
    quit,
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel,
    timeoutMs: 10_000,
  });
  return { gate, reveal, showError, quit, cancel };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('window startup visibility gate', () => {
  it('keeps normal content hidden while the appearance handshake is delayed', () => {
    const startup = startupGate();
    startup.gate.start();

    expect(startup.gate.isReady()).toBe(false);
    expect(startup.reveal).not.toHaveBeenCalled();
    expect(startup.showError).not.toHaveBeenCalled();

    startup.gate.ready();
    expect(startup.gate.isReady()).toBe(true);
    expect(startup.reveal).toHaveBeenCalledTimes(1);
    expect(startup.cancel).toHaveBeenCalledTimes(1);
  });

  it('shows only a safe diagnostic and quits when the handshake times out', () => {
    const startup = startupGate();
    startup.gate.start();

    vi.advanceTimersByTime(10_000);
    startup.gate.ready();

    expect(startup.gate.isReady()).toBe(false);
    expect(startup.reveal).not.toHaveBeenCalled();
    expect(startup.showError).toHaveBeenCalledTimes(1);
    expect(startup.quit).toHaveBeenCalledTimes(1);
  });

  it('shows only a safe diagnostic after a renderer load failure', () => {
    const startup = startupGate();
    startup.gate.start();

    startup.gate.fail();

    expect(startup.gate.isReady()).toBe(false);
    expect(startup.reveal).not.toHaveBeenCalled();
    expect(startup.showError).toHaveBeenCalledTimes(1);
    expect(startup.quit).toHaveBeenCalledTimes(1);
    expect(startup.cancel).toHaveBeenCalledTimes(1);
  });
});
