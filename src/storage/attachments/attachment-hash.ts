import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync } from 'node:fs';

export function hashAttachment(path: string): string {
  const descriptor = openSync(path, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
    return hash.digest('hex');
  } finally {
    closeSync(descriptor);
  }
}
