import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { Clock } from '../types';
import {
  backupDataSchema,
  type BackupData,
  type BackupManifest,
} from './schemas';
import type { BackupResult } from './backup-types';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachment-store';
import {
  copyRegularFile,
  MAX_DATA_SIZE_BYTES,
  MAX_MANIFEST_SIZE_BYTES,
  MAX_PACKAGE_SIZE_BYTES,
  regularFileSize,
} from './package-files';

const FORMAT_VERSION = 1;
const SCHEMA_VERSION = 7;
const APP_VERSION = '0.1.0';

export function exportTo(
  parentDir: string,
  profilePath: string,
  clock: Clock,
): BackupResult {
  let temporary = '';
  let ownsTemporary = false;
  try {
    const exportedAt = clock.now();
    const folder = join(
      parentDir,
      `FlowPilot-export-${exportedAt.toString().slice(0, 10)}`,
    );
    temporary = `${folder}.tmp-${String(process.pid)}`;
    if (existsSync(folder))
      return { ok: false, error: 'Папка экспорта уже существует' };
    mkdirSync(temporary, { recursive: false });
    ownsTemporary = true;
    const data = readProfile(profilePath);
    const files = writeDataFiles(temporary, profilePath, data);
    writeManifest(
      temporary,
      createManifest(exportedAt.toString(), data, files),
    );
    renameSync(temporary, folder);
    return { ok: true, value: folder };
  } catch (error) {
    if (ownsTemporary) rmSync(temporary, { recursive: true, force: true });
    return { ok: false, error: errorMessage(error) };
  }
}

function writeDataFiles(
  temporary: string,
  profilePath: string,
  data: BackupData,
): BackupManifest['files'] {
  const dataSize = writeBoundedData(temporary, data);
  const attachments = writeAttachments(
    temporary,
    profilePath,
    data,
    MAX_PACKAGE_SIZE_BYTES - dataSize,
  );
  return [
    {
      path: 'data.json',
      sha256: hashFile(join(temporary, 'data.json')),
      sizeBytes: dataSize,
    },
    ...attachments,
  ];
}

function writeBoundedData(temporary: string, data: BackupData): number {
  const descriptor = openSync(
    join(temporary, 'data.json'),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  let written = 0;
  try {
    const writePart = (value: string): void => {
      const bytes = Buffer.from(value);
      if (written + bytes.length > MAX_DATA_SIZE_BYTES)
        throw new Error('Размер data.json превышает лимит');
      let offset = 0;
      while (offset < bytes.length)
        offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
      written += bytes.length;
    };
    writeJsonValue(data, writePart);
  } finally {
    closeSync(descriptor);
  }
  return written;
}
function writeJsonValue(
  value: unknown,
  writePart: (text: string) => void,
): void {
  if (typeof value === 'string') {
    writeJsonString(value, writePart);
  } else if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    writePart(JSON.stringify(value));
  } else if (Array.isArray(value)) {
    writePart('[');
    value.forEach((item, index) => {
      if (index) writePart(',');
      writeJsonValue(item, writePart);
    });
    writePart(']');
  } else if (typeof value === 'object') {
    writePart('{');
    Object.entries(value).forEach(([key, item], index) => {
      if (index) writePart(',');
      writeJsonString(key, writePart);
      writePart(':');
      writeJsonValue(item, writePart);
    });
    writePart('}');
  } else {
    throw new Error('Невозможно сериализовать данные профиля');
  }
}

function writeJsonString(
  value: string,
  writePart: (text: string) => void,
): void {
  writePart('"');
  for (let offset = 0; offset < value.length; offset += 4096) {
    const escaped = JSON.stringify(value.slice(offset, offset + 4096));
    writePart(escaped.slice(1, -1));
  }
  writePart('"');
}

function writeAttachments(
  temporary: string,
  profilePath: string,
  data: BackupData,
  remaining: number,
): BackupManifest['files'] {
  const files: BackupManifest['files'][number][] = [];
  assertAttachmentsFit(profilePath, data.attachments, remaining);
  for (const record of data.attachments) {
    const target = join(temporary, 'attachments', record.id);
    mkdirSync(dirname(target), { recursive: true });
    const sizeBytes = copyRegularFile(
      dirname(profilePath),
      `attachments/${record.id}`,
      target,
      {
        maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
        expected: { sizeBytes: record.size_bytes, sha256: record.sha256 },
        aggregateRemaining: remaining,
      },
    );
    remaining -= sizeBytes;
    files.push({
      path: `attachments/${record.id}`,
      sha256: record.sha256,
      sizeBytes,
    });
  }
  return files;
}

function assertAttachmentsFit(
  profilePath: string,
  attachments: BackupData['attachments'],
  remaining: number,
): void {
  for (const item of attachments) {
    const size = regularFileSize(
      dirname(profilePath),
      `attachments/${item.id}`,
      MAX_ATTACHMENT_SIZE_BYTES,
    );
    if (size > remaining) throw new Error('Размер пакета превышает лимит');
    remaining -= size;
  }
}

function createManifest(
  exportedAt: string,
  data: BackupData,
  files: BackupManifest['files'],
): BackupManifest {
  return {
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    revision: data.revision,
    historyIncluded: false,
    historyNote:
      'История изменений не экспортируется; при восстановлении создаётся запись restore.',
    files,
  };
}

function writeManifest(temporary: string, manifest: BackupManifest): void {
  const serialized = JSON.stringify(manifest, null, 2);
  if (
    manifest.files.length > 10_000 ||
    Buffer.byteLength(serialized) > MAX_MANIFEST_SIZE_BYTES
  )
    throw new Error('Размер manifest.json превышает лимит');
  writeFileSync(join(temporary, 'manifest.json'), serialized, { flag: 'wx' });
}

function readProfile(path: string): BackupData {
  if (!existsSync(path)) throw new Error('Профиль не найден');
  const database = new Database(path);
  try {
    const query = (table: string): Record<string, unknown>[] =>
      database
        .prepare(
          `SELECT * FROM ${table}${table === 'columns' ? ' ORDER BY position' : table === 'tasks' ? ' ORDER BY position,id' : ''}`,
        )
        .all() as Record<string, unknown>[];
    const metadata = database
      .prepare('SELECT revision FROM metadata WHERE singleton = 1')
      .get() as { revision: number };
    return backupDataSchema.parse({
      columns: query('columns'),
      tasks: query('tasks'),
      subtasks: query('subtasks'),
      comments: query('comments'),
      attachments: query('attachments'),
      settings: query('settings'),
      revision: metadata.revision,
    });
  } finally {
    database.close();
  }
}

function hashFile(path: string): string {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(64 * 1024);
    let offset = 0;
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, offset);
      if (!count) return hash.digest('hex');
      hash.update(chunk.subarray(0, count));
      offset += count;
    }
  } finally {
    closeSync(descriptor);
  }
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
