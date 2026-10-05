import { MAX_CONTEXT_TEXT_LENGTH } from './context-types';

const FILE_PATH = new RegExp(
  [
    String.raw`\bfile:\/\/(?:localhost)?\/(?:[^/\s,;]+(?:\s+[^/\s,;]+)*\/)*(?:[^/\s,;]+(?:\s+[^/\s,;]+)*\.[A-Za-z0-9]+|[^/\s,;!?]+(?:\s+(?!then\b)[^/\s,;!?]+)*)|`,
    String.raw`(?<![\w:/.=?&])\/(?:[^/\s,;]+\/)*(?:[^/\s,;]+(?:\s+[^/\s,;]+)*\/)*[^/\s,;]+(?:\s+[^/\s,;.!?]+)*\.[A-Za-z0-9]+|`,
    String.raw`(?<![\w:/.=?&])\/(?:[^/\s,;]+(?:\s+[^/\s,;]+)*\/)+[^/\s,;.!?]+(?:\s+(?!then\b)[^/\s,;.!?]+)*|`,
    String.raw`(?<![\w:/.=?&])\/(?:[^/\s,;]+\/)*[^/\s,;]+(?:\s+(?!then\b)[^/\s,;]+)*|`,
    String.raw`(?<![\w/:.=?&])(?!(?:and\/or)\b)(?:[\p{L}\p{N}_.-]+\/)+[\p{L}\p{N}_.-]+(?:\.[\p{L}\p{N}]+)?|`,
    String.raw`\b[A-Za-z]:[\\/](?:[^\\/:,;]+[\\/])*[^\\/:,;]+(?:\s+[^\\/:,;]+)*\.[A-Za-z0-9]+|`,
    String.raw`\b[A-Za-z]:[\\/](?:[^\\/:,;]+[\\/])*[^\\/:,\s;!?]+(?:\s+(?!then\b)[^\\/:,\s;!?]+)*|`,
    String.raw`\\\\[^\\\s,;]+\\(?:[^\\,;]+\\)*[^\\,;]+\.[A-Za-z0-9]+|`,
    String.raw`\\\\[^\\\s,;]+\\(?:[^\\,;]+\\)*[^\\\s,;!?]+(?:\s+(?!then\b)[^\\\s,;!?]+)*`,
  ].join(''),
  'giu',
);

export function sanitizeUntrustedText(value: string): string {
  return value
    .replace(FILE_PATH, '[путь скрыт]')
    .slice(0, MAX_CONTEXT_TEXT_LENGTH);
}
