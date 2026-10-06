import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  backupDataSchema,
  manifestSchema,
  type BackupData,
  type BackupManifest,
} from './schemas';
import type { BackupProblem, Verification } from './backup-types';

const FORMAT_VERSION = 1;
const SCHEMA_VERSION = 7;
type PackageContents = { manifest: BackupManifest; data: BackupData };

export function verifyPackage(dir: string): Verification {
  const parsed = readPackage(dir);
  if (!parsed.ok) return parsed;
  const { manifest, data } = parsed.value;
  const problems: BackupProblem[] = [];
  if (manifest.revision !== data.revision)
    problems.push({
      path: 'manifest.json',
      message: 'revision не совпадает с data.json',
    });
  const listed = verifyFiles(dir, manifest, problems);
  verifyReferences(data, listed, problems);
  return problems.length
    ? { ok: false, problems }
    : { ok: true, value: { manifest, data } };
}

function readPackage(
  dir: string,
):
  | { ok: true; value: PackageContents }
  | { ok: false; problems: readonly BackupProblem[] } {
  try {
    const manifestResult = manifestSchema.safeParse(
      JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as unknown,
    );
    if (!manifestResult.success)
      return failure('manifest.json', manifestResult.error.message);
    const manifest = manifestResult.data;
    if (manifest.formatVersion > FORMAT_VERSION)
      return failure(
        'manifest.json',
        `Версия формата ${String(manifest.formatVersion)} новее поддерживаемой ${String(FORMAT_VERSION)}`,
      );
    if (manifest.formatVersion !== FORMAT_VERSION)
      return failure(
        'manifest.json',
        `Неподдерживаемая версия формата ${String(manifest.formatVersion)}`,
      );
    if (manifest.schemaVersion > SCHEMA_VERSION)
      return failure(
        'manifest.json',
        `Версия схемы ${String(manifest.schemaVersion)} новее поддерживаемой ${String(SCHEMA_VERSION)}`,
      );
    const dataResult = backupDataSchema.safeParse(
      JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8')) as unknown,
    );
    if (!dataResult.success)
      return failure('data.json', dataResult.error.message);
    return { ok: true, value: { manifest, data: dataResult.data } };
  } catch (error) {
    return failure('package', errorMessage(error));
  }
}

function verifyFiles(
  dir: string,
  manifest: BackupManifest,
  problems: BackupProblem[],
): Map<string, BackupManifest['files'][number]> {
  const listed = new Map<string, BackupManifest['files'][number]>();
  for (const file of manifest.files) {
    if (!isPackagePath(file.path)) {
      problems.push({ path: file.path, message: 'Недопустимый путь файла' });
      continue;
    }
    if (listed.has(file.path))
      problems.push({ path: file.path, message: 'Повтор файла в manifest' });
    listed.set(file.path, file);
    verifyFileContents(dir, file, problems);
  }
  if (!listed.has('data.json'))
    problems.push({
      path: 'manifest.json',
      message: 'manifest не содержит data.json',
    });
  return listed;
}

function verifyFileContents(
  dir: string,
  file: BackupManifest['files'][number],
  problems: BackupProblem[],
): void {
  try {
    const path = join(dir, file.path);
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('not a regular file');
    const bytes = readFileSync(path);
    if (bytes.length !== file.sizeBytes || hash(bytes) !== file.sha256)
      problems.push({
        path: file.path,
        message: 'Размер или sha256 не совпадает',
      });
  } catch {
    problems.push({
      path: file.path,
      message: 'Файл отсутствует или недоступен',
    });
  }
}

function verifyReferences(
  data: BackupData,
  listed: ReadonlyMap<string, BackupManifest['files'][number]>,
  problems: BackupProblem[],
): void {
  const columns = new Set(data.columns.map((item) => item.id));
  const tasks = new Set(data.tasks.map((item) => item.id));
  for (const item of data.tasks)
    if (!columns.has(item.column_id))
      problems.push({
        path: 'data.json',
        message: `Задача ${item.id} ссылается на отсутствующую колонку`,
      });
  for (const item of [...data.subtasks, ...data.comments])
    if (!tasks.has(item.task_id))
      problems.push({
        path: 'data.json',
        message: `Ссылка ${item.id} ведёт на отсутствующую задачу`,
      });
  for (const item of data.attachments) {
    if (!tasks.has(item.task_id))
      problems.push({
        path: 'data.json',
        message: `Вложение ${item.id} ссылается на отсутствующую задачу`,
      });
    const file = listed.get(`attachments/${item.id}`);
    if (!file)
      problems.push({
        path: 'manifest.json',
        message: `manifest не содержит вложение ${item.id}`,
      });
    else if (file.sha256 !== item.sha256 || file.sizeBytes !== item.size_bytes)
      problems.push({
        path: 'data.json',
        message: `Метаданные вложения ${item.id} не совпадают с файлом`,
      });
  }
}

function isPackagePath(path: string): boolean {
  return path === 'data.json' || /^attachments\/[A-Za-z0-9_-]+$/.test(path);
}
function failure(path: string, message: string): Verification {
  return { ok: false, problems: [{ path, message }] };
}
function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
