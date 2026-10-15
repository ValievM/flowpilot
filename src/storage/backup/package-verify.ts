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
  packageFileSize,
  readPackageJson,
} from './package-files';

const FORMAT_VERSION = 1;
const SCHEMA_VERSION = 10;
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
  const scan = scanPackageFiles(dir, manifest.files, problems);
  if (!scan.listed.has('data.json'))
    problems.push({
      path: 'manifest.json',
      message: 'manifest не содержит data.json',
    });
  if (scan.exceeded) return scan.listed;
  for (const { file, size } of scan.files)
    verifyFileContents(dir, file, size, problems);
  return scan.listed;
}

function scanPackageFiles(
  dir: string,
  files: BackupManifest['files'],
  problems: BackupProblem[],
): {
  listed: Map<string, BackupManifest['files'][number]>;
  files: { file: BackupManifest['files'][number]; size: number }[];
  exceeded: boolean;
} {
  const listed = new Map<string, BackupManifest['files'][number]>();
  const actualFiles: { file: BackupManifest['files'][number]; size: number }[] =
    [];
  let total = 0;
  for (const file of files) {
    if (!isPackagePath(file.path)) {
      problems.push({ path: file.path, message: 'Недопустимый путь файла' });
      continue;
    }
    if (listed.has(file.path))
      problems.push({ path: file.path, message: 'Повтор файла в manifest' });
    listed.set(file.path, file);
    const limit =
      file.path === 'data.json'
        ? MAX_DATA_SIZE_BYTES
        : MAX_ATTACHMENT_SIZE_BYTES;
    if (file.sizeBytes > limit) {
      problems.push({
        path: file.path,
        message: 'Размер файла превышает лимит',
      });
      continue;
    }
    try {
      const size = packageFileSize(dir, file.path, limit);
      if (size > MAX_PACKAGE_SIZE_BYTES - total) {
        problems.push({
          path: 'manifest.json',
          message: 'Размер пакета превышает лимит',
        });
        return { listed, files: actualFiles, exceeded: true };
      }
      total += size;
      actualFiles.push({ file, size });
    } catch (error) {
      problems.push({ path: file.path, message: errorMessage(error) });
    }
  }
  return { listed, files: actualFiles, exceeded: false };
}

function verifyFileContents(
  dir: string,
  file: BackupManifest['files'][number],
  maxSizeBytes: number,
  problems: BackupProblem[],
): number | undefined {
  try {
    const contents = hashPackageFile(dir, file.path, maxSizeBytes);
    if (
      contents.sizeBytes !== file.sizeBytes ||
      contents.sha256 !== file.sha256
    ) {
      problems.push({
        path: file.path,
        message: 'Размер или sha256 не совпадает',
      });
    }
    return contents.sizeBytes;
  } catch (error) {
    problems.push({ path: file.path, message: errorMessage(error) });
    return undefined;
  }
}

function verifyReferences(
  data: BackupData,
  listed: ReadonlyMap<string, BackupManifest['files'][number]>,
  problems: BackupProblem[],
): void {
  const columns = new Set(data.columns.map((item) => item.id));
  const tasks = new Set(data.tasks.map((item) => item.id));
  verifyCatalogReferences(data, problems);
  verifyRuleVersionReferences(data, problems);
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
function verifyCatalogReferences(
  data: BackupData,
  problems: BackupProblem[],
): void {
  const taskTypes = new Set(data.task_types.map((item) => item.id));
  const disciplines = new Set(data.disciplines.map((item) => item.id));
  for (const task of data.tasks) {
    if (task.type_id && !taskTypes.has(task.type_id))
      problems.push({
        path: 'data.json',
        message: `Задача ${task.id} ссылается на отсутствующий тип`,
      });
    if (task.discipline_id && !disciplines.has(task.discipline_id))
      problems.push({
        path: 'data.json',
        message: `Задача ${task.id} ссылается на отсутствующую дисциплину`,
      });
  }
}

function verifyRuleVersionReferences(
  data: BackupData,
  problems: BackupProblem[],
): void {
  const ruleIds = new Set(data.rules.map((rule) => rule.id));
  for (const version of data.rule_versions)
    if (!ruleIds.has(version.rule_id))
      problems.push({
        path: 'data.json',
        message: `Версия правила ${version.rule_id} не связана с документом`,
      });
  for (const rule of data.rules) {
    const hasActiveDocument = rule.active_document_json !== null;
    const hasActiveVersion = rule.active_version !== null;
    if (hasActiveDocument !== hasActiveVersion) {
      problems.push({
        path: 'data.json',
        message: `Активное состояние правила ${rule.id} неполное`,
      });
      continue;
    }
    if (!hasActiveVersion) {
      if (rule.status === 'active')
        problems.push({
          path: 'data.json',
          message: `Активная версия правила ${rule.id} не сохранена`,
        });
      continue;
    }
    const archivedVersion = data.rule_versions.find(
      ({ rule_id, version }) =>
        rule_id === rule.id && version === rule.active_version,
    );
    if (!archivedVersion) {
      problems.push({
        path: 'data.json',
        message: `Архив не содержит активную версию правила ${rule.id}`,
      });
      continue;
    }
    if (archivedVersion.document_json !== rule.active_document_json)
      problems.push({
        path: 'data.json',
        message: `Активная версия правила ${rule.id} не совпадает с архивом`,
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
