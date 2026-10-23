import React from 'react';

const POLL_MS = 200;

/**
 * While a request waits for a pasted reply, look for its prompt. Only reads what
 * is waiting; it never starts an AI request, which is why it lives in its own file.
 */
export function usePendingExchange(
  running: boolean,
  onFound: (exchange: { operationId: string; prompt: string }) => void,
): void {
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void window.flowpilot.ai.pending().then((result) => {
        const first = result.ok ? result.value[0] : undefined;
        if (first) onFound(first);
      });
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [running, onFound]);
}
