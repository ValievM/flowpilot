import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachment-store';

export const MAX_MANIFEST_SIZE_BYTES = 1024 * 1024;
export const MAX_DATA_SIZE_BYTES = 64 * 1024 * 1024;
export const MAX_PACKAGE_SIZE_BYTES = 512 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;

type PackageFile = { sizeBytes: number; sha256: string };

export function copyRegularFile(
  sourcePath: string,
  destination: string,
  maxSizeBytes: number,
  expected: PackageFile,
): void {
  const source = openRegularFile(sourcePath, maxSizeBytes);
  let target: number | undefined;
  try {
    const info = fstatSync(source);
    if (info.size !== expected.sizeBytes)
      throw new Error('Размер вложения изменился после проверки');
    target = openSync(
      destination,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    copyBytes(source, target, info.size, expected.sha256);
  } finally {
    closeSync(source);
    if (target !== undefined) closeSync(target);
  }
}

export function readPackageJson(
  dir: string,
  relativePath: string,
  maxSizeBytes: number,
): string {
  const descriptor = openPackageFile(dir, relativePath, maxSizeBytes);
  try {
    const size = fstatSync(descriptor).size;
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, bytes, offset, size - offset, offset);
      if (count === 0) throw new Error('Файл изменился во время чтения');
      offset += count;
    }
    return bytes.toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

export function hashPackageFile(
  dir: string,
  relativePath: string,
  maxSizeBytes: number,
): PackageFile {
  const descriptor = openPackageFile(dir, relativePath, maxSizeBytes);
  try {
    const info = fstatSync(descriptor);
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(CHUNK_SIZE);
    let bytesRead = 0;
    while (bytesRead < info.size) {
      const count = readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.length, info.size - bytesRead),
        bytesRead,
      );
      if (count === 0) throw new Error('Файл изменился во время проверки');
      hash.update(chunk.subarray(0, count));
      bytesRead += count;
    }
    return { sizeBytes: bytesRead, sha256: hash.digest('hex') };
  } finally {
    closeSync(descriptor);
  }
}

export function copyPackageFile(
  dir: string,
  relativePath: string,
  destination: string,
  expected: PackageFile,
): void {
  const source = openPackageFile(dir, relativePath, MAX_ATTACHMENT_SIZE_BYTES);
  let target: number | undefined;
  try {
    const info = fstatSync(source);
    if (info.size !== expected.sizeBytes)
      throw new Error('Размер вложения изменился после проверки');
    target = openSync(
      destination,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    copyBytes(source, target, info.size, expected.sha256);
  } finally {
    closeSync(source);
    if (target !== undefined) closeSync(target);
  }
}

function openRegularFile(path: string, maxSizeBytes: number): number {
  const fileInfo = lstatSync(path);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink())
    throw new Error('Путь должен быть обычным файлом');
  if (fileInfo.size > maxSizeBytes)
    throw new Error('Размер файла превышает лимит');
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const opened = fstatSync(descriptor);
  if (!opened.isFile() || opened.size > maxSizeBytes) {
    closeSync(descriptor);
    throw new Error('Размер файла превышает лимит');
  }
  return descriptor;
}

function copyBytes(
  source: number,
  target: number,
  sizeBytes: number,
  expectedSha256: string,
): void {
  const hash = createHash('sha256');
  const chunk = Buffer.alloc(CHUNK_SIZE);
  let bytesRead = 0;
  while (bytesRead < sizeBytes) {
    const count = readSync(
      source,
      chunk,
      0,
      Math.min(chunk.length, sizeBytes - bytesRead),
      bytesRead,
    );
    if (count === 0) throw new Error('Файл изменился во время копирования');
    hash.update(chunk.subarray(0, count));
    let written = 0;
    while (written < count) {
      const countWritten = writeSync(target, chunk, written, count - written);
      if (countWritten === 0)
        throw new Error('Не удалось записать файл вложения полностью');
      written += countWritten;
    }
    bytesRead += count;
  }
  if (hash.digest('hex') !== expectedSha256)
    throw new Error('Sha256 вложения не совпадает с метаданными');
}

function openPackageFile(
  dir: string,
  relativePath: string,
  maxSizeBytes: number,
): number {
  const { root, path } = resolvePackagePath(dir, relativePath);
  if (relativePath.startsWith('attachments/'))
    assertRegularDirectory(join(root, 'attachments'), 'Папка вложений');
  return openRegularFile(path, maxSizeBytes);
}

function resolvePackagePath(
  dir: string,
  relativePath: string,
): { root: string; path: string } {
  const requestedRoot = resolve(dir);
  assertRegularDirectory(requestedRoot, 'Папка пакета');
  const root = realpathSync(requestedRoot);
  const path = resolve(root, relativePath);
  if (!path.startsWith(`${root}${sep}`))
    throw new Error('Путь выходит за пределы пакета');
  return { root, path };
}

function assertRegularDirectory(path: string, label: string): void {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`${label} должна быть обычной директорией`);
}
