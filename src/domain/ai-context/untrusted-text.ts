import { MAX_CONTEXT_TEXT_LENGTH } from './context-types';

const FILE_PATH =
  /\bfile:\/\/[^\s,;]+|(?<![\w:/])\/(?:[^/\s,;]+\/)*(?:[^/\s,;]+(?:\s+[^/\s,;]+)*\/)*[^/\s,;]+\.[A-Za-z0-9]+|(?<![\w:/])\/(?:[^/\s,;]+\/)*[^/\s,;]+|(?<![\w/:])(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+|(?:\b[A-Za-z]:[\\/][^\s]*|\\\\[^\\\s]+\\[^\s]*)/gi;

export function sanitizeUntrustedText(value: string): string {
  return value
    .replace(FILE_PATH, '[путь скрыт]')
    .slice(0, MAX_CONTEXT_TEXT_LENGTH);
}
