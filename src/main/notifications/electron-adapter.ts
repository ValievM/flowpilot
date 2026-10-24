import type { Notification as ElectronNotification } from 'electron';
import type { NotificationAdapter } from './reminder-service';

type NotificationClass = typeof ElectronNotification;

/** The real macOS notification: "shown" when the system accepted it, "failed" when it did not. */
export function createElectronAdapter(
  Notification: NotificationClass,
): NotificationAdapter {
  return {
    show: ({ title, body, onClick }) =>
      new Promise((resolve) => {
        if (!Notification.isSupported()) {
          resolve('failed');
          return;
        }
        const notification = new Notification({ title, body, silent: true });
        notification.on('show', () => {
          resolve('shown');
        });
        notification.on('failed', () => {
          resolve('failed');
        });
        notification.on('click', onClick);
        notification.show();
      }),
  };
}

/** Test builds only: records what would be shown and always succeeds. */
export function createRecordingAdapter(
  calls: { title: string; body: string }[],
): NotificationAdapter {
  return {
    show: ({ title, body }) => {
      calls.push({ title, body });
      return Promise.resolve('shown');
    },
  };
}
