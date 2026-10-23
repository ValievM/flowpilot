import { readFileSync, statSync, writeFileSync } from 'node:fs';

export const MAX_RULE_FILE_BYTES = 1_048_576;

export const nodeRuleFiles = {
  size: (path: string) => statSync(path).size,
  read: (path: string) => readFileSync(path, 'utf8'),
  write: (path: string, content: string) => {
    writeFileSync(path, content, 'utf8');
  },
};
