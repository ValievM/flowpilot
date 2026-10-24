import { z } from 'zod';
import type { NotificationsStatus } from '../../shared/notification-contracts';
import type { Result } from '../../shared/ipc-result';
import {
  readReminderSettings,
  requestNotificationPermission,
  type ReminderDeps,
} from './reminder-service';

const emptyRequest = z.object({}).strict();

function statusOf(deps: ReminderDeps): NotificationsStatus {
  return readReminderSettings(deps.repository.load().settings);
}

export function getNotificationsStatus(
  request: unknown,
  deps: ReminderDeps,
): Result<NotificationsStatus> {
  if (!emptyRequest.safeParse(request).success)
    return { ok: false, error: 'ValidationFailed' };
  return { ok: true, value: statusOf(deps) };
}

export async function configureNotifications(
  request: unknown,
  deps: ReminderDeps,
): Promise<Result<NotificationsStatus>> {
  if (!emptyRequest.safeParse(request).success)
    return { ok: false, error: 'ValidationFailed' };
  await requestNotificationPermission(deps);
  return { ok: true, value: statusOf(deps) };
}
