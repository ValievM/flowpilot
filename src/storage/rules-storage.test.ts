import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import type { Task } from '../domain';
import { exportTo, restore, verifyPackage } from './backup';
import { Repository } from './repository';
import type { Clock, StorageCommand } from './types';

const directories: string[] = [];
const clock: Clock = {
  now: () => Temporal.Instant.from('2026-10-06T12:00:00Z'),
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('rule and catalog storage', () => {
  it('persists task types, disciplines, and task classification after reopening', () => {
    const path = profilePath();
    let repository = new Repository(path, clock);
    expect(
      repository.apply(
        [{ kind: 'taskType.create', taskType: { id: 'study', name: 'Учёба' } }],
        0,
      ).ok,
    ).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'discipline.create',
            discipline: { id: 'math', name: 'Математика' },
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    expect(
      repository.apply([{ kind: 'task.create', task: task() }], 2).ok,
    ).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'task.classify',
            taskId: 'task-1',
            typeId: 'study',
            disciplineId: 'math',
          },
        ],
        3,
      ).ok,
    ).toBe(true);
    repository.close();
    repository = new Repository(path, clock);
    expect(repository.load()).toMatchObject({
      taskTypes: [{ id: 'study', name: 'Учёба' }],
      disciplines: [{ id: 'math', name: 'Математика' }],
      tasks: [{ id: 'task-1', typeId: 'study', disciplineId: 'math' }],
    });
    repository.close();
  });

  it('stores an invalid same-id import as a draft without replacing its active version', () => {
    const repository = openRepository();
    addType(repository);
    importRule(repository, ruleJson('rule-a', 'Рабочая версия'));
    activateRule(repository, 'rule-a');
    const activeBefore = repository.load().rules[0]?.activeDocument;
    const revision = repository.load().revision;
    expect(
      repository.apply(
        [
          {
            kind: 'rule.import',
            documentJson: JSON.stringify({ id: 'rule-a', typo: true }),
          },
        ],
        revision,
      ).ok,
    ).toBe(true);
    const stored = repository.load().rules[0];
    expect(stored).toMatchObject({
      status: 'draft',
      activeDocument: activeBefore,
    });
    expect(stored?.errors).not.toHaveLength(0);
    repository.close();
  });

  it('rejects activation on lint conflict and leaves the previous accepted version active', () => {
    const repository = openRepository();
    addType(repository);
    importRule(repository, ruleJson('active', 'Важное'));
    activateRule(repository, 'active');
    const conflicted = JSON.stringify({
      ...(JSON.parse(ruleJson('conflict', 'Конфликт')) as object),
      rules: [
        { id: 'high', kind: 'priority', level: 'high', reason: 'first' },
        { id: 'low', kind: 'priority', level: 'low', reason: 'second' },
      ],
    });
    importRule(repository, conflicted);
    const failed = repository.apply(
      [{ kind: 'rule.activate', ruleId: 'conflict' }],
      repository.load().revision,
    );
    expect(failed).toMatchObject({ ok: false });
    expect(
      repository.load().rules.find(({ id }) => id === 'active')?.activeDocument
        ?.id,
    ).toBe('active');
    expect(
      repository.load().rules.find(({ id }) => id === 'conflict')
        ?.activeDocument,
    ).toBeNull();
    repository.close();
  });

  it('keeps each successfully activated document version for rollback', () => {
    const repository = openRepository();
    addType(repository);
    importRule(repository, ruleJson('rule-a', 'Первая версия'));
    activateRule(repository, 'rule-a');
    importRule(repository, ruleJson('rule-a', 'Вторая версия'));
    activateRule(repository, 'rule-a');
    const versions = repository.load().rules[0]?.versions;
    expect(
      versions?.map(({ documentJson }) => {
        const document = JSON.parse(documentJson) as { title: string };
        return document.title;
      }),
    ).toEqual(['Первая версия', 'Вторая версия']);
    repository.close();
  });
  it('keeps compatible rules active when activating another document', () => {
    const repository = openRepository();
    addType(repository);
    const created = repository.apply(
      [
        {
          kind: 'taskType.create',
          taskType: { id: 'other', name: 'Другой тип' },
        },
      ],
      repository.load().revision,
    );
    expect(created.ok).toBe(true);
    importRule(repository, ruleJson('study-rule', 'Учёба'));
    activateRule(repository, 'study-rule');
    const otherRule = JSON.parse(ruleJson('other-rule', 'Другое')) as {
      scope: { task_type_ids: string[] };
    };
    otherRule.scope.task_type_ids = ['other'];
    importRule(repository, JSON.stringify(otherRule));
    activateRule(repository, 'other-rule');
    expect(
      repository
        .load()
        .rules.filter(({ activeDocument }) => activeDocument !== null)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(['other-rule', 'study-rule']);
    repository.close();
  });

  it('updates an existing document on repeated import without creating a duplicate', () => {
    const repository = openRepository();
    addType(repository);
    importRule(repository, ruleJson('same-id', 'Первый заголовок'));
    importRule(repository, ruleJson('same-id', 'Новый заголовок'));
    expect(repository.load().rules).toHaveLength(1);
    expect(repository.load().rules[0]?.document?.title).toBe('Новый заголовок');
    repository.close();
  });

  it('retains rule links after renaming a referenced task type', () => {
    const repository = openRepository();
    addType(repository);
    importRule(repository, ruleJson('linked', 'Связанное правило'));
    activateRule(repository, 'linked');
    const revision = repository.load().revision;
    expect(
      repository.apply(
        [{ kind: 'taskType.rename', id: 'study', name: 'Новые занятия' }],
        revision,
      ).ok,
    ).toBe(true);
    expect(
      repository.load().rules[0]?.activeDocument?.scope.task_type_ids,
    ).toEqual(['study']);
    repository.close();
  });

  it('deactivates and diagnoses rules that reference a deleted type', () => {
    const repository = openRepository();
    addType(repository);
    importRule(repository, ruleJson('linked', 'Связанное правило'));
    activateRule(repository, 'linked');
    const revision = repository.load().revision;
    expect(
      repository.apply([{ kind: 'taskType.delete', id: 'study' }], revision).ok,
    ).toBe(true);
    const stored = repository.load().rules[0];
    expect(stored?.status).toBe('draft');
    expect(stored?.activeDocument).toBeNull();
    expect(
      stored?.diagnostics.some(({ code }) => code === 'unknown-task-type'),
    ).toBe(true);
    repository.close();
  });

  it('undoes rule activation and restores the previously active document', () => {
    const repository = openRepository();
    addType(repository);
    importRule(repository, ruleJson('before', 'До'));
    activateRule(repository, 'before');
    importRule(repository, ruleJson('after', 'После'));
    activateRule(repository, 'after');
    const activation = repository.history(10).entries[0];
    expect(activation).toBeDefined();
    const undone = repository.undo(activation?.id);
    if (!undone.ok) throw new Error(JSON.stringify(undone));
    expect(undone.ok).toBe(true);
    expect(
      repository.load().rules.find(({ id }) => id === 'before')?.activeDocument
        ?.id,
    ).toBe('before');
    expect(
      repository.load().rules.find(({ id }) => id === 'after')?.activeDocument,
    ).toBeNull();
    repository.close();
  });

  it('round-trips catalogs, drafts, active documents, and accepted versions; reads old packages without new sections', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-rules-backup-'));
    directories.push(directory);
    const path = join(directory, 'profile.sqlite');
    const repository = new Repository(path, clock);
    addType(repository);
    importRule(repository, ruleJson('backup-rule', 'Восстановление'));
    activateRule(repository, 'backup-rule');
    const exported = exportTo(directory, path, clock);
    expect(exported.ok).toBe(true);
    repository.close();
    if (!exported.ok) throw new Error(exported.error);
    const verification = verifyPackage(exported.value);
    if (!verification.ok) throw new Error(JSON.stringify(verification));
    expect(restore(exported.value, path, clock).ok).toBe(true);
    const restored = new Repository(path, clock);
    expect(restored.load().rules[0]).toMatchObject({
      status: 'active',
      activeDocument: { id: 'backup-rule' },
      versions: [{ version: 1 }],
    });
    restored.close();
    const oldDataPath = join(exported.value, 'data.json');
    const oldData = JSON.parse(readFileSync(oldDataPath, 'utf8')) as {
      task_types?: unknown;
      disciplines?: unknown;
      rules?: unknown;
      rule_versions?: unknown;
      tasks: Record<string, unknown>[];
    };
    delete oldData.task_types;
    delete oldData.disciplines;
    delete oldData.rules;
    delete oldData.rule_versions;
    for (const storedTask of oldData.tasks) {
      delete storedTask.type_id;
      delete storedTask.discipline_id;
    }
    const oldDataContents = JSON.stringify(oldData);
    writeFileSync(oldDataPath, oldDataContents);
    const manifestPath = join(exported.value, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      files: { path: string; sha256: string; sizeBytes: number }[];
    };
    const dataFile = manifest.files.find(
      ({ path: filePath }) => filePath === 'data.json',
    );
    if (!dataFile) throw new Error('Missing data package entry');
    dataFile.sha256 = createHash('sha256')
      .update(oldDataContents)
      .digest('hex');
    dataFile.sizeBytes = Buffer.byteLength(oldDataContents);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(verifyPackage(exported.value).ok).toBe(true);
    const oldPath = join(directory, 'old-profile.sqlite');
    const oldRestore = restore(exported.value, oldPath, clock);
    if (!oldRestore.ok) throw new Error(oldRestore.error);
    const restoredOld = new Repository(oldPath, clock);
    expect(restoredOld.load()).toMatchObject({
      taskTypes: [],
      disciplines: [],
      rules: [],
    });
    restoredOld.close();
  });
  it('rejects exported tasks that reference missing catalog entries', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-rule-references-'));
    directories.push(directory);
    const path = join(directory, 'profile.sqlite');
    const repository = new Repository(path, clock);
    addType(repository);
    expect(
      repository.apply([{ kind: 'task.create', task: task() }], 1).ok,
    ).toBe(true);
    expect(
      repository.apply(
        [{ kind: 'task.classify', taskId: 'task-1', typeId: 'study' }],
        2,
      ).ok,
    ).toBe(true);
    const exported = exportTo(directory, path, clock);
    repository.close();
    if (!exported.ok) throw new Error(exported.error);
    const dataPath = join(exported.value, 'data.json');
    const data = JSON.parse(readFileSync(dataPath, 'utf8')) as {
      tasks: { type_id: string | null }[];
    };
    const storedTask = data.tasks[0];
    if (!storedTask) throw new Error('Expected exported task');
    storedTask.type_id = 'missing-type';
    const dataContents = JSON.stringify(data);
    writeFileSync(dataPath, dataContents);
    const manifestPath = join(exported.value, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      files: { path: string; sha256: string; sizeBytes: number }[];
    };
    const dataFile = manifest.files.find(
      ({ path: itemPath }) => itemPath === 'data.json',
    );
    if (!dataFile) throw new Error('Missing data package entry');
    dataFile.sha256 = createHash('sha256').update(dataContents).digest('hex');
    dataFile.sizeBytes = Buffer.byteLength(dataContents);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const verification = verifyPackage(exported.value);
    expect(verification.ok).toBe(false);
    if (verification.ok) throw new Error('Expected catalog reference error');
    expect(
      verification.problems.some(({ message }) =>
        message.includes('отсутствующий тип'),
      ),
    ).toBe(true);
  });

  it('rejects a stale expected revision without applying catalog changes', () => {
    const repository = openRepository();
    addType(repository);
    const result = repository.apply(
      [{ kind: 'taskType.create', taskType: { id: 'other', name: 'Другое' } }],
      0,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'StaleRevision' },
    });
    expect(repository.load().taskTypes).toHaveLength(1);
    repository.close();
  });

  it('rejects a task classification with an unknown catalog identifier', () => {
    const repository = openRepository();
    expect(
      repository.apply([{ kind: 'task.create', task: task() }], 0).ok,
    ).toBe(true);
    const result = repository.apply(
      [{ kind: 'task.classify', taskId: 'task-1', typeId: 'missing' }],
      1,
    );
    expect(result).toMatchObject({ ok: false });
    expect(repository.load().tasks[0]?.typeId).toBeUndefined();
    repository.close();
  });
});

function openRepository(): Repository {
  return new Repository(profilePath(), clock);
}

function profilePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-rules-storage-'));
  directories.push(directory);
  return join(directory, 'profile.sqlite');
}

function task(): Task {
  return {
    id: 'task-1',
    title: 'Учиться',
    status: { kind: 'todo' },
    columnId: 'todo',
    subtasks: [],
    comments: [],
    attachments: [],
    addedOrder: 0,
  };
}

function addType(repository: Repository): void {
  const result = repository.apply(
    [{ kind: 'taskType.create', taskType: { id: 'study', name: 'Учёба' } }],
    repository.load().revision,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
}

function importRule(repository: Repository, documentJson: string): void {
  const command: StorageCommand = { kind: 'rule.import', documentJson };
  const result = repository.apply([command], repository.load().revision);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
}

function activateRule(repository: Repository, ruleId: string): void {
  const result = repository.apply(
    [{ kind: 'rule.activate', ruleId }],
    repository.load().revision,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
}

function ruleJson(id: string, title: string): string {
  return JSON.stringify({
    schema_version: 'v1',
    id,
    title,
    scope: { task_type_ids: ['study'] },
    rules: [
      {
        id: 'priority',
        kind: 'priority',
        level: 'high',
        reason: 'Важная задача',
      },
    ],
  });
}
