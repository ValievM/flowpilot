import type { Result } from './ipc-result';

export type NotificationPermission = 'unknown' | 'granted' | 'denied';

export type NotificationsStatus = {
  readonly enabled: boolean;
  readonly leadMinutes: number;
  readonly permission: NotificationPermission;
};

export type NotificationOpenTarget =
  { readonly kind: 'task'; readonly id: string } | { readonly kind: 'today' };

export type NotificationsApi = {
  status(): Promise<Result<NotificationsStatus>>;
  /** Asks macOS for permission; only ever called from the "Настроить" button. */
  configure(): Promise<Result<NotificationsStatus>>;
  onOpen(listener: (target: NotificationOpenTarget) => void): () => void;
};
