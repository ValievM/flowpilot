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
import { basename, dirname, join, resolve } from 'node:path';
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
  sourcePath: string,
  destination: string,
  options: CopyRegularFileOptions,
): number {
  const remaining = options.aggregateRemaining ?? MAX_PACKAGE_SIZE_BYTES;
  const source = openRegularAt(
    dirname(sourcePath),
    basename(sourcePath),
    Math.min(options.maxSizeBytes, remaining),
    dirname(dirname(sourcePath)),
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

export function regularFileSize(path: string, maxSizeBytes: number): number {
  const descriptor = openRegularAt(
    dirname(path),
    basename(path),
    maxSizeBytes,
    dirname(dirname(path)),
  );
  try {
    return fstatSync(descriptor).size;
  } finally {
    closeSync(descriptor);
  }
}

function openPackageFile(
  dir: string,
  relativePath: string,
  maxSizeBytes: number,
): number {
  const root = resolve(dir);
  const relative = relativePath.startsWith('attachments/')
    ? relativePath.slice('attachments/'.length)
    : relativePath;
  const directory = relativePath.startsWith('attachments/')
    ? join(root, 'attachments')
    : root;
  return openRegularAt(directory, relative, maxSizeBytes, root);
}

function openRegularAt(
  directory: string,
  name: string,
  maxSizeBytes: number,
  root?: string,
): number {
  const rootFd = root === undefined ? undefined : openDirectory(root);
  let directoryFd: number | undefined;
  let descriptor: number | undefined;
  try {
    directoryFd = openDirectory(directory);
    assertRootUnchanged(rootFd, root);
    descriptor = openValidatedFile(join(directory, name), maxSizeBytes);
    assertDirectoryUnchanged(directoryFd, directory);
    assertRootUnchanged(rootFd, root);
    const result = descriptor;
    descriptor = undefined;
    return result;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (directoryFd !== undefined) closeSync(directoryFd);
    if (rootFd !== undefined) closeSync(rootFd);
  }
}

function openValidatedFile(path: string, maxSizeBytes: number): number {
  const listed = lstatSync(path);
  if (!listed.isFile() || listed.isSymbolicLink())
    throw new Error('Путь должен быть обычным файлом');
  if (listed.size > maxSizeBytes)
    throw new Error('Размер файла превышает лимит');
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const opened = fstatSync(descriptor);
  if (!sameFile(listed, opened) || !opened.isFile()) {
    closeSync(descriptor);
    throw new Error('Файл изменился во время открытия');
  }
  if (opened.size > maxSizeBytes) {
    closeSync(descriptor);
    throw new Error('Размер файла превышает лимит');
  }
  return descriptor;
}

function assertRootUnchanged(
  rootFd: number | undefined,
  root: string | undefined,
): void {
  if (
    rootFd !== undefined &&
    root !== undefined &&
    !sameFile(fstatSync(rootFd), lstatSync(root))
  )
    throw new Error('Папка пакета изменилась во время открытия');
}

function assertDirectoryUnchanged(
  directoryFd: number,
  directory: string,
): void {
  if (!sameFile(fstatSync(directoryFd), lstatSync(directory)))
    throw new Error('Каталог изменился во время открытия');
}
function sameFile(
  first: { dev: number; ino: number },
  second: { dev: number; ino: number },
): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

function openDirectory(path: string): number {
  const before = lstatSync(path);
  if (!before.isDirectory() || before.isSymbolicLink())
    throw new Error('Путь должен быть обычной директорией');
  const descriptor = openSync(path, DIRECTORY_FLAGS);
  const opened = fstatSync(descriptor);
  if (before.dev !== opened.dev || before.ino !== opened.ino) {
    closeSync(descriptor);
    throw new Error('Каталог изменился во время открытия');
  }
  return descriptor;
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
