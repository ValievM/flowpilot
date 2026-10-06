interface WindowStartupDependencies {
  readonly reveal: () => void;
  readonly showError: () => void;
  readonly quit: () => void;
  readonly schedule: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  readonly cancel: (timer: NodeJS.Timeout) => void;
  readonly timeoutMs: number;
}

export interface WindowStartupGate {
  start(): void;
  ready(): void;
  fail(): void;
  stop(): void;
  isReady(): boolean;
}

export function createWindowStartupGate(
  dependencies: WindowStartupDependencies,
): WindowStartupGate {
  let state: 'pending' | 'ready' | 'failed' = 'pending';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = (): void => {
    if (timer === undefined) return;
    dependencies.cancel(timer);
    timer = undefined;
  };

  const fail = (): void => {
    if (state !== 'pending') return;
    state = 'failed';
    clearTimer();
    dependencies.showError();
    dependencies.quit();
  };

  return {
    start() {
      if (state !== 'pending' || timer !== undefined) return;
      timer = dependencies.schedule(fail, dependencies.timeoutMs);
    },
    ready() {
      if (state !== 'pending') return;
      state = 'ready';
      clearTimer();
      dependencies.reveal();
    },
    fail,
    stop: clearTimer,
    isReady: () => state === 'ready',
  };
}
