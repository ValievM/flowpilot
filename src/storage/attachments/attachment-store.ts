import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import type Database from 'better-sqlite3';
import { basename, extname, join } from 'node:path';
import type { Clock } from '../types';
import { cleanAttachmentName, mediaTypeFor } from './attachment-metadata';
import {
  moveToTrash as moveFileToTrash,
  restoreFromTrash as restoreFileFromTrash,
} from './attachment-trash';
import { collectOrphanAttachments } from './attachment-gc';
import { hashAttachment } from './attachment-hash';

export const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;

type AddError =
  | { kind: 'FileNotFound' }
  | { kind: 'NotAFile' }
  | { kind: 'TooLarge'; limitBytes: number }
  | { kind: 'NotReadable' }
  | { kind: 'CopyFailed' };

export type AttachmentRecord = {
  id: string;
  taskId: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

type AttachmentStoreOptions = {
  maxSizeBytes?: number;
  makeId?: () => string;
};

export class AttachmentStore {
  private readonly limit: number;
  private readonly makeId: () => string;

  constructor(
    private readonly database: Database.Database,
    private readonly dataDir: string,
    private readonly clock: Clock,
    options: AttachmentStoreOptions = {},
  ) {
    this.limit = options.maxSizeBytes ?? MAX_ATTACHMENT_SIZE_BYTES;
    this.makeId = options.makeId ?? randomUUID;
  }

  prepare(
    taskId: string,
    sourcePath: string,
  ): { ok: true; value: AttachmentRecord } | { ok: false; error: AddError } {
    const source = inspectSource(sourcePath);
    if (!source.ok) return source;
    if (source.value.size > this.limit)
      return { ok: false, error: { kind: 'TooLarge', limitBytes: this.limit } };
    return this.copyFile(taskId, sourcePath, source.value.size);
  }

  insert(record: AttachmentRecord): void {
    this.database
      .prepare(
        'INSERT INTO attachments(id, task_id, name, media_type, size_bytes, position, sha256, created_at) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM attachments WHERE task_id = ?), 0), ?, ?)',
      )
      .run(
        record.id,
        record.taskId,
        record.name,
        record.mediaType,
        record.sizeBytes,
        record.taskId,
        record.sha256,
        record.createdAt,
      );
  }

  discard(attachmentId: string): void {
    if (!safeAttachmentId(attachmentId)) return;
    removeFile(join(this.attachmentDir(), attachmentId));
  }

  add(
    taskId: string,
    sourcePath: string,
  ): { ok: true; value: AttachmentRecord } | { ok: false; error: AddError } {
    const prepared = this.prepare(taskId, sourcePath);
    if (!prepared.ok) return prepared;
    try {
      this.database.transaction(() => {
        this.insert(prepared.value);
      })();
      return prepared;
    } catch (error) {
      this.discard(prepared.value.id);
      return { ok: false, error: classifyCopyError(error) };
    }
  }

  getPath(attachmentId: string): string | undefined {
    const row = this.database
      .prepare('SELECT id FROM attachments WHERE id = ?')
      .get(attachmentId) as { id: string } | undefined;
    return row &&
      safeAttachmentId(row.id) &&
      isAttachmentDirectory(this.attachmentDir())
      ? join(this.attachmentDir(), row.id)
      : undefined;
  }

  verify(
    attachmentId: string,
  ): { kind: 'Valid' } | { kind: 'Missing' } | { kind: 'ChecksumMismatch' } {
    const row = this.record(attachmentId);
    if (
      !row ||
      !safeAttachmentId(row.id) ||
      !isAttachmentDirectory(this.attachmentDir())
    )
      return { kind: 'Missing' };
    try {
      const path = join(this.attachmentDir(), row.id);
      if (!lstatSync(path).isFile()) return { kind: 'Missing' };
      return hashAttachment(path) === row.sha256
        ? { kind: 'Valid' }
        : { kind: 'ChecksumMismatch' };
    } catch {
      return { kind: 'Missing' };
    }
  }

  moveToTrash(attachmentId: string): boolean {
    return moveFileToTrash(this.attachmentDir(), attachmentId);
  }

  restoreFromTrash(attachmentId: string): boolean {
    return restoreFileFromTrash(this.attachmentDir(), attachmentId);
  }

  recoverInterruptedRemovals(): void {
    const trashed = join(this.attachmentDir(), '.trash');
    if (!existsSync(trashed)) return;
    const rows = this.database.prepare('SELECT id FROM attachments').all() as {
      id: string;
    }[];
    const trashedIds = new Set(readdirSync(trashed));
    for (const { id } of rows) {
      if (!trashedIds.has(id)) continue;
      if (!this.restoreFromTrash(id))
        throw new Error(`Unable to recover attachment ${id}`);
    }
  }

  gc(): number {
    const directory = this.attachmentDir();
    return isAttachmentDirectory(directory)
      ? collectOrphanAttachments(this.database, directory)
      : 0;
  }

  private copyFile(
    taskId: string,
    sourcePath: string,
    sourceSize: number,
  ): { ok: true; value: AttachmentRecord } | { ok: false; error: AddError } {
    const id = this.makeId();
    if (!safeAttachmentId(id))
      return { ok: false, error: { kind: 'CopyFailed' } };
    const directory = this.attachmentDir();
    const temporaryPath = join(directory, `.${id}.tmp`);
    const finalPath = join(directory, id);
    try {
      mkdirSync(directory, { recursive: true });
      if (!isAttachmentDirectory(directory))
        throw new Error('Attachment directory must be a real directory');
      copyFileSync(sourcePath, temporaryPath);
      const sizeBytes = statSync(temporaryPath).size;
      if (sizeBytes > this.limit) {
        removeFile(temporaryPath);
        return {
          ok: false,
          error: { kind: 'TooLarge', limitBytes: this.limit },
        };
      }
      if (sizeBytes !== sourceSize)
        throw new Error('Source changed during copy');
      const sha256 = hashAttachment(temporaryPath);
      renameSync(temporaryPath, finalPath);
      const record = makeRecord(
        id,
        taskId,
        { sourcePath, sizeBytes, sha256 },
        this.clock,
      );
      return { ok: true, value: record };
    } catch (error) {
      removeFile(temporaryPath);
      removeFile(finalPath);
      return { ok: false, error: classifyCopyError(error) };
    }
  }

  private record(id: string): AttachmentRecord | undefined {
    return this.database
      .prepare(
        'SELECT id, task_id AS taskId, name, media_type AS mediaType, size_bytes AS sizeBytes, sha256, created_at AS createdAt FROM attachments WHERE id = ?',
      )
      .get(id) as AttachmentRecord | undefined;
  }

  private attachmentDir(): string {
    return join(this.dataDir, 'attachments');
  }
}

function inspectSource(
  sourcePath: string,
): { ok: true; value: { size: number } } | { ok: false; error: AddError } {
  try {
    const info = lstatSync(sourcePath);
    if (info.isSymbolicLink() && statSync(sourcePath).isDirectory())
      return { ok: false, error: { kind: 'NotAFile' } };
    const target = statSync(sourcePath);
    if (!target.isFile()) return { ok: false, error: { kind: 'NotAFile' } };
    return { ok: true, value: { size: target.size } };
  } catch (error) {
    return { ok: false, error: classifySourceError(error) };
  }
}

function makeRecord(
  id: string,
  taskId: string,
  details: { sourcePath: string; sizeBytes: number; sha256: string },
  clock: Clock,
): AttachmentRecord {
  const name = cleanAttachmentName(basename(details.sourcePath));
  return {
    id,
    taskId,
    name,
    mediaType: mediaTypeFor(extname(name)),
    sizeBytes: details.sizeBytes,
    sha256: details.sha256,
    createdAt: clock.now().toString(),
  };
}

function classifySourceError(error: unknown): AddError {
  if (errorCode(error) === 'ENOENT') return { kind: 'FileNotFound' };
  if (errorCode(error) === 'EACCES' || errorCode(error) === 'EPERM')
    return { kind: 'NotReadable' };
  return { kind: 'CopyFailed' };
}

function classifyCopyError(error: unknown): AddError {
  if (errorCode(error) === 'EACCES' || errorCode(error) === 'EPERM')
    return { kind: 'NotReadable' };
  return { kind: 'CopyFailed' };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
function safeAttachmentId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function isAttachmentDirectory(path: string): boolean {
  if (!existsSync(path)) return false;
  const info = lstatSync(path);
  return info.isDirectory() && !info.isSymbolicLink();
}

function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT' && errorCode(error) !== 'ENOTDIR')
      throw error;
  }
}
