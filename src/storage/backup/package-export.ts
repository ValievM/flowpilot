import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
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
  const dataBytes = Buffer.from(JSON.stringify(data, null, 2));
  if (dataBytes.length > MAX_DATA_SIZE_BYTES)
    throw new Error('Размер data.json превышает лимит');
  writeFileSync(join(temporary, 'data.json'), dataBytes, { flag: 'wx' });
  const attachments = writeAttachments(temporary, profilePath, data);
  if (
    attachments.reduce(
      (total, file) => total + file.sizeBytes,
      dataBytes.length,
    ) > MAX_PACKAGE_SIZE_BYTES
  )
    throw new Error('Размер пакета превышает лимит');
  return [
    {
      path: 'data.json',
      sha256: hash(dataBytes),
      sizeBytes: dataBytes.length,
    },
    ...attachments,
  ];
}

function writeAttachments(
  temporary: string,
  profilePath: string,
  data: BackupData,
): BackupManifest['files'] {
  const files: BackupManifest['files'][number][] = [];
  for (const record of data.attachments) {
    const source = join(dirname(profilePath), 'attachments', record.id);
    const target = join(temporary, 'attachments', record.id);
    mkdirSync(dirname(target), { recursive: true });
    copyRegularFile(source, target, MAX_ATTACHMENT_SIZE_BYTES, {
      sizeBytes: record.size_bytes,
      sha256: record.sha256,
    });
    files.push({
      path: `attachments/${record.id}`,
      sha256: record.sha256,
      sizeBytes: record.size_bytes,
    });
  }
  return files;
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

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
