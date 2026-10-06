import { describe, expect, it } from 'vitest';
import {
  attachmentAddRequestSchema,
  attachmentOpenRequestSchema,
  backupRestoreRequestSchema,
  ipcChannels,
} from '../shared/contracts';

describe('history and file IPC contracts', () => {
  it('defines narrow channels for history, attachments, and backups', () => {
    expect(ipcChannels).toMatchObject({
      historyList: 'history.list',
      historyUndo: 'history.undo',
      attachmentsAdd: 'attachments.add',
      attachmentsOpen: 'attachments.open',
      attachmentsRemove: 'attachments.remove',
      backupExport: 'backup.export',
      backupVerify: 'backup.verify',
      backupRestore: 'backup.restore',
    });
  });

  it('rejects a renderer-supplied attachment path', () => {
    expect(
      attachmentAddRequestSchema.safeParse({
        taskId: 'task-1',
        path: '/private/file',
      }).success,
    ).toBe(false);
  });

  it('accepts only a verified package token for restore', () => {
    expect(
      backupRestoreRequestSchema.safeParse({
        packageToken: 'token-1',
        path: '/private/package',
      }).success,
    ).toBe(false);
  });

  it('rejects renderer paths for attachment opening', () => {
    expect(
      attachmentOpenRequestSchema.safeParse({
        attachmentId: 'attachment-1',
        path: '/private/file',
      }).success,
    ).toBe(false);
  });
});
