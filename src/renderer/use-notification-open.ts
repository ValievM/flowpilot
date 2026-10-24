import React from 'react';
import type { View } from './types';

/** A clicked system notification brings the person to the task, or to Today. */
export function useNotificationOpen(
  setView: (view: View) => void,
  openTask: (taskId: string, trigger: HTMLElement) => void,
): void {
  React.useEffect(
    () =>
      window.flowpilot.notifications.onOpen((target) => {
        setView('today');
        if (target.kind === 'task') openTask(target.id, document.body);
      }),
    [setView, openTask],
  );
}
