import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { AiProvider, AiRequest, ProviderResult } from './ai-provider';

const RUN_TIMEOUT_MS = 180_000;

export interface CodexRunInput {
  readonly binary?: string;
  readonly prompt: string;
  readonly signal: AbortSignal;
}
export interface CodexRunResult {
  readonly code: number;
  readonly lastMessage: string;
}
export interface CodexDeps {
  readonly run: (input: CodexRunInput) => Promise<CodexRunResult>;
  readonly findBinary: () => string | undefined;
}

function promptFor(request: AiRequest): string {
  return [
    request.instruction,
    'Контекст (JSON):',
    JSON.stringify(request.context, null, 2),
    'Схема ответа (JSON Schema):',
    JSON.stringify(request.responseSchema, null, 2),
    'Ответь только JSON-объектом по этой схеме: без пояснений, без текста до и после, без инструментов и файлов.',
  ].join('\n');
}

/** Codex may fence the answer or add a word around it; take the JSON object itself. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON');
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export function createCodexProvider(deps: CodexDeps): AiProvider {
  return {
    async ask(
      request: AiRequest,
      signal: AbortSignal,
    ): Promise<ProviderResult<unknown>> {
      const binary = deps.findBinary();
      if (!binary) return { ok: false, error: { kind: 'ProviderUnavailable' } };
      let result: CodexRunResult;
      try {
        result = await deps.run({ binary, prompt: promptFor(request), signal });
      } catch {
        return {
          ok: false,
          error: { kind: signal.aborted ? 'Aborted' : 'ProviderUnavailable' },
        };
      }
      if (result.code !== 0)
        return { ok: false, error: { kind: 'ProviderUnavailable' } };
      try {
        return { ok: true, value: extractJson(result.lastMessage) };
      } catch {
        return { ok: false, error: { kind: 'InvalidReply' } };
      }
    },
  };
}

export function parseCodexStatus(
  code: number | undefined,
  output: string,
): { installed: boolean; loggedIn: boolean } {
  if (code === undefined) return { installed: false, loggedIn: false };
  return { installed: true, loggedIn: code === 0 && /logged in/i.test(output) };
}

/** The GUI app does not inherit the shell PATH, so the usual Homebrew places are tried too. */
export function findCodexBinary(): string | undefined {
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, 'codex'));
  return [
    ...fromPath,
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    join(homedir(), '.local', 'bin', 'codex'),
  ].find((candidate) => existsSync(candidate));
}

/** One non-interactive run: the prompt goes in on stdin, the last message comes back through a file. */
export function runCodexExec(input: CodexRunInput): Promise<CodexRunResult> {
  const binary = input.binary ?? 'codex';
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-codex-'));
  const outFile = join(directory, 'answer.txt');
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '-s',
        'read-only',
        '-C',
        directory,
        '-o',
        outFile,
        '-',
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] },
    );
    const stop = (): void => {
      child.kill('SIGTERM');
    };
    const timer = setTimeout(stop, RUN_TIMEOUT_MS);
    input.signal.addEventListener('abort', stop, { once: true });
    const finish = (settle: () => void): void => {
      clearTimeout(timer);
      input.signal.removeEventListener('abort', stop);
      settle();
    };
    child.on('error', (error) => {
      finish(() => {
        rmSync(directory, { recursive: true, force: true });
        reject(error);
      });
    });
    child.on('close', (code) => {
      finish(() => {
        const lastMessage = existsSync(outFile)
          ? readFileSync(outFile, 'utf8')
          : '';
        rmSync(directory, { recursive: true, force: true });
        if (input.signal.aborted) reject(new Error('aborted'));
        else resolve({ code: code ?? 1, lastMessage });
      });
    });
    child.stdin.end(input.prompt);
  });
}

export function checkCodexStatus(
  binary: string | undefined,
): Promise<{ installed: boolean; loggedIn: boolean }> {
  if (!binary) return Promise.resolve(parseCodexStatus(undefined, ''));
  return new Promise((resolve) => {
    execFile(
      binary,
      ['login', 'status'],
      { timeout: 10_000 },
      (error, stdout, stderr) => {
        const code =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve(parseCodexStatus(code, `${stdout}${stderr}`));
      },
    );
  });
}
