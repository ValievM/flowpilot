import { existsSync, lstatSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export function moveToTrash(directory: string, id: string): boolean {
  if (!safeId(id)) return false;
  const source = join(directory, id);
  if (!isRegularFile(source)) return false;
  ensureDirectory(directory, 'Attachment directory must be a real directory');
  const trash = join(directory, '.trash');
  mkdirSync(trash, { recursive: true });
  ensureDirectory(trash, 'Attachment trash directory must be a real directory');
  const destination = join(trash, id);
  if (existsSync(destination)) return false;
  renameSync(source, destination);
  return true;
}

export function restoreFromTrash(directory: string, id: string): boolean {
  if (!safeId(id)) return false;
  const trash = join(directory, '.trash');
  if (!isRegularDirectory(trash)) return false;
  const source = join(trash, id);
  if (!isRegularFile(source)) return false;
  ensureDirectory(directory, 'Attachment directory must be a real directory');
  const destination = join(directory, id);
  if (existsSync(destination)) return false;
  renameSync(source, destination);
  return true;
}

function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch (error) {
    if (missingPath(error)) return false;
    throw error;
  }
}

function ensureDirectory(path: string, message: string): void {
  if (!isRegularDirectory(path)) throw new Error(message);
}

function isRegularDirectory(path: string): boolean {
  if (!existsSync(path)) return false;
  const info = lstatSync(path);
  return info.isDirectory() && !info.isSymbolicLink();
}

function safeId(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function missingPath(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return false;
  return error.code === 'ENOENT' || error.code === 'ENOTDIR';
}
