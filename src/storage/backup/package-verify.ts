import type { BackupProblem, Verification } from './backup-types';
import {
  backupDataSchema,
  manifestSchema,
  type BackupData,
  type BackupManifest,
} from './schemas';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachment-store';
import {
  hashPackageFile,
  MAX_DATA_SIZE_BYTES,
  MAX_MANIFEST_SIZE_BYTES,
  MAX_PACKAGE_SIZE_BYTES,
  readPackageJson,
} from './package-files';

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
      JSON.parse(
        readPackageJson(dir, 'manifest.json', MAX_MANIFEST_SIZE_BYTES),
      ) as unknown,
    );
    if (!manifestResult.success)
      return failure('manifest.json', manifestResult.error.message);
    const manifest = manifestResult.data;
    const validationError = validateManifest(manifest);
    if (validationError) return failure('manifest.json', validationError);
    const dataResult = backupDataSchema.safeParse(
      JSON.parse(
        readPackageJson(dir, 'data.json', MAX_DATA_SIZE_BYTES),
      ) as unknown,
    );
    if (!dataResult.success)
      return failure('data.json', dataResult.error.message);
    return { ok: true, value: { manifest, data: dataResult.data } };
  } catch (error) {
    return failure('package', errorMessage(error));
  }
}
function validateManifest(manifest: BackupManifest): string | undefined {
  if (manifest.formatVersion > FORMAT_VERSION)
    return `Версия формата ${String(manifest.formatVersion)} новее поддерживаемой ${String(FORMAT_VERSION)}`;
  if (manifest.formatVersion !== FORMAT_VERSION)
    return `Неподдерживаемая версия формата ${String(manifest.formatVersion)}`;
  if (manifest.schemaVersion > SCHEMA_VERSION)
    return `Версия схемы ${String(manifest.schemaVersion)} новее поддерживаемой ${String(SCHEMA_VERSION)}`;
  const declaredSize = manifest.files.reduce(
    (total, file) => total + file.sizeBytes,
    0,
  );
  if (declaredSize > MAX_PACKAGE_SIZE_BYTES)
    return 'Размер пакета превышает лимит';
  if (
    manifest.files.some(
      (file) =>
        file.sizeBytes >
        (file.path === 'data.json'
          ? MAX_DATA_SIZE_BYTES
          : MAX_ATTACHMENT_SIZE_BYTES),
    )
  )
    return 'Размер файла превышает лимит';
}

function verifyFiles(
  dir: string,
  manifest: BackupManifest,
  problems: BackupProblem[],
): Map<string, BackupManifest['files'][number]> {
  const listed = new Map<string, BackupManifest['files'][number]>();
  let packageSize = 0;
  for (const file of manifest.files) {
    if (!isPackagePath(file.path)) {
      problems.push({ path: file.path, message: 'Недопустимый путь файла' });
      continue;
    }
    if (listed.has(file.path))
      problems.push({ path: file.path, message: 'Повтор файла в manifest' });
    listed.set(file.path, file);
    const fileLimit =
      file.path === 'data.json'
        ? MAX_DATA_SIZE_BYTES
        : MAX_ATTACHMENT_SIZE_BYTES;
    if (file.sizeBytes > fileLimit)
      problems.push({
        path: file.path,
        message: 'Размер файла превышает лимит',
      });
    packageSize += file.sizeBytes;
    verifyFileContents(dir, file, fileLimit, problems);
  }
  if (packageSize > MAX_PACKAGE_SIZE_BYTES)
    problems.push({
      path: 'manifest.json',
      message: 'Размер пакета превышает лимит',
    });
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
  maxSizeBytes: number,
  problems: BackupProblem[],
): void {
  try {
    const contents = hashPackageFile(dir, file.path, maxSizeBytes);
    if (
      contents.sizeBytes !== file.sizeBytes ||
      contents.sha256 !== file.sha256
    )
      problems.push({
        path: file.path,
        message: 'Размер или sha256 не совпадает',
      });
  } catch (error) {
    problems.push({
      path: file.path,
      message: errorMessage(error),
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
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
