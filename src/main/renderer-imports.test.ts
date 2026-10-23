import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe('renderer imports', () => {
  it('never loads the domain barrel at runtime: it pulls in Ajv, which the renderer CSP forbids', () => {
    const offenders = sources(path.resolve(__dirname, '../renderer')).filter(
      (file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .some(
            (line) =>
              /^import\s+(?!type\b).*from\s+'(\.\.\/)+domain'/.test(line) ||
              (/^import\s+\{[^}]*\}\s+from\s+'(\.\.\/)+domain'/.test(line) &&
                !/^import\s+type\b/.test(line)),
          ),
    );
    expect(offenders).toEqual([]);
  });
});
