import { MAX_CONTEXT_TEXT_LENGTH } from './context-types';

const FILE_PATH =
  /(?:\b[A-Za-z]:[\\/][^\s]*|\\\\[^\\\s]+\\[^\s]*|(?<![\w:/])\/(?:[^/\s,;]+\/)*[^/\s,;]+)/g;

export function sanitizeUntrustedText(value: string): string {
  return value
    .replace(FILE_PATH, '[путь скрыт]')
    .slice(0, MAX_CONTEXT_TEXT_LENGTH);
}
