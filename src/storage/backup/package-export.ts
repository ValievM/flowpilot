import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
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

const FORMAT_VERSION = 1;
const SCHEMA_VERSION = 7;
const APP_VERSION = '0.1.0';

export function exportTo(
  parentDir: string,
  profilePath: string,
  clock: Clock,
): BackupResult {
  let temporary = '';
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
    const data = readProfile(profilePath);
    const files = writeDataFiles(temporary, profilePath, data);
    writeManifest(
      temporary,
      createManifest(exportedAt.toString(), data, files),
    );
    renameSync(temporary, folder);
    return { ok: true, value: folder };
  } catch (error) {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    return { ok: false, error: errorMessage(error) };
  }
}

function writeDataFiles(
  temporary: string,
  profilePath: string,
  data: BackupData,
): BackupManifest['files'] {
  const dataBytes = Buffer.from(JSON.stringify(data, null, 2));
  writeFileSync(join(temporary, 'data.json'), dataBytes, { flag: 'wx' });
  return [
    { path: 'data.json', sha256: hash(dataBytes), sizeBytes: dataBytes.length },
    ...writeAttachments(temporary, profilePath, data),
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
    copyFileSync(source, target);
    const bytes = readFileSync(target);
    files.push({
      path: `attachments/${record.id}`,
      sha256: hash(bytes),
      sizeBytes: bytes.length,
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
  writeFileSync(
    join(temporary, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    { flag: 'wx' },
  );
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
