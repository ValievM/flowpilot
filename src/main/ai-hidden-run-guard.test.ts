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

// F-07 / AC-01: the AI runs only when the person asks. A file that can start an
// AI request must not also own a timer, so a timer can never start one.
const STARTS_AI =
  /\.ai\.(scenario|run)\(|callScenario\(|requestWhatNow\(|runner\.run\(|\.ask\(/;
const TIMER = /\b(setInterval|setTimeout)\(/;
// The runner's timeout only ends a request that was already asked for.
const ALLOWED = new Set(['src/main/ai/ai-runner.ts']);

describe('no hidden AI runs (F-07, AC-01)', () => {
  it('never lets a timer live in a file that can start an AI request', () => {
    const root = path.resolve(__dirname, '../..');
    const files = [
      ...sources(path.join(root, 'src/main/ai')),
      ...sources(path.join(root, 'src/renderer')),
    ];
    const offenders = files
      .map((file) => path.relative(root, file))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => {
        const text = readFileSync(path.join(root, file), 'utf8');
        return STARTS_AI.test(text) && TIMER.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
