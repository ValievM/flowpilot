import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  writeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import nativeOpen from '@flowpilot/openat';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachment-store';

export const MAX_MANIFEST_SIZE_BYTES = 1024 * 1024;
export const MAX_DATA_SIZE_BYTES = 64 * 1024 * 1024;
export const MAX_PACKAGE_SIZE_BYTES = 512 * 1024 * 1024;
const CHUNK_SIZE = 64 * 1024;
const DIRECTORY_FLAGS =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
type PackageFile = { sizeBytes: number; sha256: string };
type CopyRegularFileOptions = {
  maxSizeBytes: number;
  expected: PackageFile;
  aggregateRemaining?: number;
};

export function copyRegularFile(
  root: string,
  relativePath: string,
  destination: string,
  options: CopyRegularFileOptions,
): number {
  const remaining = options.aggregateRemaining ?? MAX_PACKAGE_SIZE_BYTES;
  const source = openPackageFile(
    root,
    relativePath,
    Math.min(options.maxSizeBytes, remaining),
  );
  let target: number | undefined;
  try {
    const size = fstatSync(source).size;
    if (size !== options.expected.sizeBytes)
      throw new Error('Размер вложения изменился после проверки');
    target = openSync(
      destination,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    copyBytes(source, target, size, options.expected.sha256);
    return size;
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
      if (!count) throw new Error('Файл изменился во время чтения');
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
    const size = fstatSync(descriptor).size;
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(CHUNK_SIZE);
    let offset = 0;
    while (offset < size) {
      const count = readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.length, size - offset),
        offset,
      );
      if (!count) throw new Error('Файл изменился во время проверки');
      hash.update(chunk.subarray(0, count));
      offset += count;
    }
    return { sizeBytes: offset, sha256: hash.digest('hex') };
  } finally {
    closeSync(descriptor);
  }
}

export function packageFileSize(
  dir: string,
  relativePath: string,
  maxSizeBytes: number,
): number {
  const descriptor = openPackageFile(dir, relativePath, maxSizeBytes);
  try {
    return fstatSync(descriptor).size;
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
    const size = fstatSync(source).size;
    if (size !== expected.sizeBytes)
      throw new Error('Размер вложения изменился после проверки');
    target = openSync(
      destination,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    copyBytes(source, target, size, expected.sha256);
  } finally {
    closeSync(source);
    if (target !== undefined) closeSync(target);
  }
}

export function regularFileSize(
  root: string,
  relativePath: string,
  maxSizeBytes: number,
): number {
  const descriptor = openPackageFile(root, relativePath, maxSizeBytes);
  try {
    return fstatSync(descriptor).size;
  } finally {
    closeSync(descriptor);
  }
}

function openPackageFile(
  directory: string,
  relativePath: string,
  maxSizeBytes: number,
): number {
  const attachmentPath = relativePath.startsWith('attachments/');
  const name = attachmentPath
    ? relativePath.slice('attachments/'.length)
    : relativePath;
  if (name.length === 0 || name.includes('/'))
    throw new Error('Недопустимый путь файла');

  const rootFd = openDirectory(resolve(directory));
  let attachmentFd: number | undefined;
  let descriptor: number | undefined;
  try {
    const parentFd = attachmentPath
      ? (attachmentFd = openDirectoryAt(rootFd, 'attachments'))
      : rootFd;
    descriptor = openValidatedFileAt(parentFd, name, maxSizeBytes);
    const result = descriptor;
    descriptor = undefined;
    return result;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (attachmentFd !== undefined) closeSync(attachmentFd);
    closeSync(rootFd);
  }
}

function openValidatedFileAt(
  directoryFd: number,
  name: string,
  maxSizeBytes: number,
): number {
  const descriptor = nativeOpen.openAt(
    directoryFd,
    name,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) throw new Error('Путь должен быть обычным файлом');
    if (opened.size > maxSizeBytes)
      throw new Error('Размер файла превышает лимит');
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function openDirectoryAt(parentFd: number, name: string): number {
  const descriptor = nativeOpen.openAt(parentFd, name, DIRECTORY_FLAGS);
  try {
    if (!fstatSync(descriptor).isDirectory())
      throw new Error('Путь должен быть обычной директорией');
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function openDirectory(path: string): number {
  const before = lstatSync(path);
  if (!before.isDirectory() || before.isSymbolicLink())
    throw new Error('Путь должен быть обычной директорией');
  const descriptor = openSync(path, DIRECTORY_FLAGS);
  try {
    const opened = fstatSync(descriptor);
    if (before.dev !== opened.dev || before.ino !== opened.ino)
      throw new Error('Каталог изменился во время открытия');
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function copyBytes(
  source: number,
  target: number,
  size: number,
  expectedSha256: string,
): void {
  const hash = createHash('sha256');
  const chunk = Buffer.alloc(CHUNK_SIZE);
  let offset = 0;
  while (offset < size) {
    const count = readSync(
      source,
      chunk,
      0,
      Math.min(chunk.length, size - offset),
      offset,
    );
    if (!count) throw new Error('Файл изменился во время копирования');
    hash.update(chunk.subarray(0, count));
    let written = 0;
    while (written < count) {
      const amount = writeSync(target, chunk, written, count - written);
      if (!amount)
        throw new Error('Не удалось записать файл вложения полностью');
      written += amount;
    }
    offset += count;
  }
  if (hash.digest('hex') !== expectedSha256)
    throw new Error('Sha256 вложения не совпадает с метаданными');
}
