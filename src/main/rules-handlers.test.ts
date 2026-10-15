import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../storage';
import type { Clock } from '../storage';
import { activateRule, exportRuleFile, importRuleFile } from './rules-handlers';

const directories: string[] = [];
const clock: Clock = {
  now: () => Temporal.Instant.from('2026-10-05T12:00:00Z'),
};
const validRule = JSON.stringify({
  schema_version: 'v1',
  id: 'rule-a',
  title: 'Правило',
  scope: { task_type_ids: ['study'] },
  rules: [
    { id: 'priority-a', kind: 'priority', level: 'high', reason: 'Важно' },
  ],
});

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('rules file handlers', () => {
  it('imports a selected valid JSON file as a draft', async () => {
    const { repository, directory } = openRepository();
    repository.apply(
      [{ kind: 'taskType.create', taskType: { id: 'study', name: 'Учёба' } }],
      0,
    );
    const path = join(directory, 'rules.json');
    writeFileSync(path, validRule);
    const result = await importRuleFile(
      {},
      {
        repository,
        dialogs: {
          openRulesFile: () => Promise.resolve(path),
          saveRulesFile: () => Promise.resolve(undefined),
        },
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(repository.load().rules[0]).toMatchObject({
      id: 'rule-a',
      status: 'draft',
    });
    repository.close();
  });

  it('returns rule validation errors by path without changing an active rule', async () => {
    const { repository, directory } = openRepository();
    repository.apply(
      [{ kind: 'taskType.create', taskType: { id: 'study', name: 'Учёба' } }],
      0,
    );
    repository.apply([{ kind: 'rule.import', documentJson: validRule }], 1);
    repository.apply([{ kind: 'rule.activate', ruleId: 'rule-a' }], 2);
    const activeBefore = repository.load().rules[0]?.activeDocument;
    const path = join(directory, 'invalid.json');
    writeFileSync(
      path,
      JSON.stringify({ schema_version: 'v1', id: 'rule-a', typo: true }),
    );
    const result = await importRuleFile(
      {},
      {
        repository,
        dialogs: {
          openRulesFile: () => Promise.resolve(path),
          saveRulesFile: () => Promise.resolve(undefined),
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('RuleInvalid');
      if (result.error.kind === 'RuleInvalid')
        expect(
          result.error.errors.some(
            ({ path: errorPath }) => errorPath === 'typo',
          ),
        ).toBe(true);
    }
    expect(repository.load().rules[0]?.activeDocument).toEqual(activeBefore);
    repository.close();
  });

  it('rejects an oversized file before reading it', async () => {
    const { repository, directory } = openRepository();
    const path = join(directory, 'large.json');
    writeFileSync(path, 'x');
    const result = await importRuleFile(
      {},
      {
        repository,
        dialogs: {
          openRulesFile: () => Promise.resolve(path),
          saveRulesFile: () => Promise.resolve(undefined),
        },
        files: {
          size: () => 1_048_577,
          read: () => {
            throw new Error('must not read');
          },
          write: () => undefined,
        },
      },
    );
    expect(result).toEqual({ ok: false, error: { kind: 'ValidationFailed' } });
    expect(repository.load().rules).toEqual([]);
    repository.close();
  });

  it('returns Cancelled when the file chooser is dismissed', async () => {
    const { repository } = openRepository();
    const result = await importRuleFile(
      {},
      {
        repository,
        dialogs: {
          openRulesFile: () => Promise.resolve(undefined),
          saveRulesFile: () => Promise.resolve(undefined),
        },
      },
    );
    expect(result).toEqual({ ok: false, error: { kind: 'Cancelled' } });
    repository.close();
  });

  it('exports the accepted version rather than a changed draft', async () => {
    const { repository, directory } = openRepository();
    repository.apply(
      [{ kind: 'taskType.create', taskType: { id: 'study', name: 'Учёба' } }],
      0,
    );
    repository.apply([{ kind: 'rule.import', documentJson: validRule }], 1);
    repository.apply([{ kind: 'rule.activate', ruleId: 'rule-a' }], 2);
    repository.apply(
      [
        {
          kind: 'rule.import',
          documentJson: validRule.replace('Правило', 'Черновик'),
        },
      ],
      3,
    );
    const path = join(directory, 'export.json');
    const result = await exportRuleFile(
      { id: 'rule-a' },
      {
        repository,
        dialogs: {
          openRulesFile: () => Promise.resolve(undefined),
          saveRulesFile: () => Promise.resolve(path),
        },
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      title: 'Правило',
    });
    repository.close();
  });
  it('returns a JSON syntax position for malformed rule files', async () => {
    const { repository, directory } = openRepository();
    const path = join(directory, 'malformed.json');
    writeFileSync(path, '{"rules":');
    const result = await importRuleFile(
      {},
      {
        repository,
        dialogs: {
          openRulesFile: () => Promise.resolve(path),
          saveRulesFile: () => Promise.resolve(undefined),
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'RuleInvalid')
      expect(result.error.errors[0]?.path).toMatch(/^@\d+$/);
    repository.close();
  });

  it('rejects renderer-supplied file paths before opening a dialog', async () => {
    const { repository } = openRepository();
    let opened = false;
    const result = await importRuleFile(
      { path: '/tmp/unauthorized.json' },
      {
        repository,
        dialogs: {
          openRulesFile: () => {
            opened = true;
            return Promise.resolve(undefined);
          },
          saveRulesFile: () => Promise.resolve(undefined),
        },
      },
    );
    expect(result).toEqual({ ok: false, error: { kind: 'ValidationFailed' } });
    expect(opened).toBe(false);
    repository.close();
  });

  it('reports activation conflicts without replacing the active rule', () => {
    const { repository } = openRepository();
    repository.apply(
      [{ kind: 'taskType.create', taskType: { id: 'study', name: 'Учёба' } }],
      0,
    );
    repository.apply([{ kind: 'rule.import', documentJson: validRule }], 1);
    repository.apply([{ kind: 'rule.activate', ruleId: 'rule-a' }], 2);
    const conflictingRule = JSON.stringify({
      schema_version: 'v1',
      id: 'rule-b',
      title: 'Конфликт',
      scope: { task_type_ids: ['study'] },
      rules: [
        { id: 'high', kind: 'priority', level: 'high', reason: 'first' },
        { id: 'low', kind: 'priority', level: 'low', reason: 'second' },
      ],
    });
    repository.apply(
      [{ kind: 'rule.import', documentJson: conflictingRule }],
      3,
    );
    const result = activateRule({ id: 'rule-b' }, { repository });
    expect(result).toEqual({ ok: false, error: { kind: 'RuleConflict' } });
    expect(
      repository.load().rules.find(({ id }) => id === 'rule-a')?.activeDocument
        ?.id,
    ).toBe('rule-a');
    expect(
      repository.load().rules.find(({ id }) => id === 'rule-b')?.activeDocument,
    ).toBeNull();
    repository.close();
  });
});

function openRepository(): { repository: Repository; directory: string } {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-rules-ipc-'));
  directories.push(directory);
  return {
    repository: new Repository(join(directory, 'flowpilot.db'), clock),
    directory,
  };
}
