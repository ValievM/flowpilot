import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { Repository } from '../repository';
import type { Clock } from '../types';
import { exportTo, restore, verifyPackage } from './backup';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
const clock: Clock = {
  now: () => Temporal.Instant.from('2026-10-06T12:00:00Z'),
};
const task = {
  id: 'task-1',
  title: 'Задача',
  description: 'Текст',
  status: { kind: 'doing' as const },
  columnId: 'doing',
  subtasks: [{ id: 'sub-1', title: 'Шаг', completed: true }],
  comments: [{ id: 'comment-1', text: 'Заметка' }],
  attachments: [],
  addedOrder: 1,
};

function setup(): { root: string; profile: string; repository: Repository } {
  const root = mkdtempSync(join(tmpdir(), 'flowpilot-backup-'));
  directories.push(root);
  const profile = join(root, 'profile.sqlite');
  const repository = new Repository(profile, clock);
  return { root, profile, repository };
}
function source(root: string, name: string, value: string): string {
  const path = join(root, name);
  writeFileSync(path, value);
  return path;
}
function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function parsed(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
function save(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value));
}
function exportPackage(root: string, profile: string): string {
  const result = exportTo(root, profile, clock);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function updateDataHash(directory: string): void {
  const manifest = z
    .object({
      files: z.array(
        z.object({
          path: z.string(),
          sha256: z.string(),
          sizeBytes: z.number(),
        }),
      ),
    })
    .loose()
    .parse(parsed(join(directory, 'manifest.json')));
  const bytes = readFileSync(join(directory, 'data.json'));
  const file = manifest.files.find((item) => item.path === 'data.json');
  if (!file) throw new Error('missing data manifest entry');
  file.sha256 = createHash('sha256').update(bytes).digest('hex');
  file.sizeBytes = bytes.length;
  save(join(directory, 'manifest.json'), manifest);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('backup package', () => {
  it('restores tasks, details, settings and both attachment bytes into an empty profile', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    const attachment1 = source(root, 'first.txt', 'first attachment');
    const attachment2 = source(root, 'second.txt', 'second attachment');
    expect(
      repository.apply(
        [
          { kind: 'attachment.add', taskId: task.id, sourcePath: attachment1 },
          { kind: 'attachment.add', taskId: task.id, sourcePath: attachment2 },
        ],
        1,
      ).ok,
    ).toBe(true);
    expect(
      repository.apply(
        [{ kind: 'setting.set', key: 'workdays', value: [1, 2, 3] }],
        2,
      ).ok,
    ).toBe(true);
    const expected = repository.load();
    const attachmentHashes = expected.tasks[0]?.attachments.map(({ id }) =>
      digest(join(root, 'attachments', id)),
    );
    repository.close();
    const packageDir = exportPackage(root, profile);
    const restoredPath = join(root, 'new-profile.sqlite');
    expect(restore(packageDir, restoredPath, clock).ok).toBe(true);
    const restored = new Repository(restoredPath, clock);
    expect(restored.load()).toEqual({
      ...expected,
      revision: expected.revision + 1,
    });
    expect(
      restored
        .load()
        .tasks[0]?.attachments.map(({ id }) =>
          digest(join(root, 'attachments', id)),
        ),
    ).toEqual(attachmentHashes);
    expect(restored.history(1).entries[0]?.source).toBe('restore');
    restored.close();
  });

  it('rejects truncated data and does not touch current profile', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    const expected = repository.load();
    repository.close();
    const packageDir = exportPackage(root, profile);
    writeFileSync(join(packageDir, 'data.json'), '{');
    expect(verifyPackage(packageDir).ok).toBe(false);
    expect(restore(packageDir, profile, clock).ok).toBe(false);
    const current = new Repository(profile, clock);
    expect(current.load()).toEqual(expected);
    current.close();
  });

  it('rejects modified attachment bytes by checksum', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'attachment.add',
            taskId: task.id,
            sourcePath: source(root, 'file.txt', 'content'),
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = z
      .object({ attachments: z.array(z.object({ id: z.string() })) })
      .parse(parsed(join(packageDir, 'data.json')));
    writeFileSync(
      join(packageDir, 'attachments', data.attachments[0]?.id ?? 'missing'),
      'changed',
    );
    expect(verifyPackage(packageDir)).toMatchObject({
      ok: false,
      problems: [{ message: 'Размер или sha256 не совпадает' }],
    });
  });
  it('rejects attachment metadata that differs from the manifest record', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'attachment.add',
            taskId: task.id,
            sourcePath: source(root, 'file.txt', 'content'),
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = z
      .object({
        attachments: z.array(z.record(z.string(), z.unknown())),
      })
      .loose()
      .parse(parsed(join(packageDir, 'data.json')));
    const attachment = data.attachments[0];
    if (!attachment) throw new Error('Missing attachment in backup fixture');
    attachment.sha256 = '0'.repeat(64);
    save(join(packageDir, 'data.json'), data);
    updateDataHash(packageDir);
    const verification = verifyPackage(packageDir);
    expect(verification.ok).toBe(false);
    if (!verification.ok)
      expect(verification.problems[0]?.message).toContain(
        'Метаданные вложения',
      );
  });

  it('rejects future format versions with a human-readable reason', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const manifest = z
      .object({ formatVersion: z.number() })
      .loose()
      .parse(parsed(join(packageDir, 'manifest.json')));
    manifest.formatVersion = 99;
    save(join(packageDir, 'manifest.json'), manifest);
    const verification = verifyPackage(packageDir);
    expect(verification.ok).toBe(false);
    if (!verification.ok)
      expect(verification.problems[0]?.message).toContain(
        'новее поддерживаемой',
      );
  });

  it('rejects a manifest entry whose file is missing', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const manifest = z
      .object({
        files: z.array(
          z.object({
            path: z.string(),
            sha256: z.string(),
            sizeBytes: z.number(),
          }),
        ),
      })
      .loose()
      .parse(parsed(join(packageDir, 'manifest.json')));
    manifest.files.push({
      path: 'attachments/missing',
      sha256: '0'.repeat(64),
      sizeBytes: 1,
    });
    save(join(packageDir, 'manifest.json'), manifest);
    expect(verifyPackage(packageDir).ok).toBe(false);
  });

  it('rejects a task referencing an absent column', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = z
      .object({
        tasks: z.array(z.record(z.string(), z.unknown())),
      })
      .loose()
      .parse(parsed(join(packageDir, 'data.json')));
    const record = data.tasks[0];
    if (!record) throw new Error('Missing task in backup fixture');
    record.column_id = 'absent';
    save(join(packageDir, 'data.json'), data);
    updateDataHash(packageDir);
    const verification = verifyPackage(packageDir);
    expect(verification.ok).toBe(false);
    if (!verification.ok)
      expect(verification.problems[0]?.message).toContain(
        'отсутствующую колонку',
      );
  });

  it('refuses to overwrite an existing export folder', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const destination = join(root, 'FlowPilot-export-2026-10-06');
    mkdirSync(destination);
    expect(exportTo(root, profile, clock)).toMatchObject({ ok: false });
    expect(readdirSync(destination)).toEqual([]);
  });

  it('keeps the current profile and removes staging files when database assembly fails', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    const before = repository.load();
    repository.close();
    const packageDir = exportPackage(root, profile);
    let calls = 0;
    const failingClock: Clock = {
      now: () => {
        calls += 1;
        if (calls === 2) throw new Error('injected build failure');
        return clock.now();
      },
    };
    expect(restore(packageDir, profile, failingClock).ok).toBe(false);
    const current = new Repository(profile, clock);
    expect(current.load()).toEqual(before);
    current.close();
    expect(
      readdirSync(root).filter((name) => name.includes('restore-')),
    ).toEqual([]);
  });

  it('preserves the previous profile beside a restored profile', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const changed = new Repository(profile, clock);
    expect(
      changed.apply(
        [
          {
            kind: 'task.update',
            id: task.id,
            changes: { title: 'Старый профиль' },
          },
        ],
        1,
      ),
    ).toMatchObject({ ok: true });
    changed.close();
    expect(restore(packageDir, profile, clock).ok).toBe(true);
    const backups = readdirSync(root).filter((name) =>
      name.includes('.before-restore-'),
    );
    expect(backups.length).toBeGreaterThan(0);
    const saved = new Repository(
      join(
        root,
        backups.find((name) =>
          name.startsWith('profile.sqlite.before-restore-'),
        ) ?? '',
      ),
      clock,
    );
    expect(saved.load().tasks[0]?.title).toBe('Старый профиль');
    saved.close();
  });

  it('exports and restores an empty storage profile', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const target = join(root, 'empty-profile.sqlite');
    expect(restore(packageDir, target, clock).ok).toBe(true);
    const restored = new Repository(target, clock);
    expect(restored.load().tasks).toEqual([]);
    expect(restored.load().columns).toHaveLength(4);
    restored.close();
  });

  it('rejects unknown data fields and does not export token-like fields', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = z
      .record(z.string(), z.unknown())
      .parse(parsed(join(packageDir, 'data.json')));
    data.password = 'not-a-secret';
    save(join(packageDir, 'data.json'), data);
    updateDataHash(packageDir);
    expect(verifyPackage(packageDir)).toMatchObject({
      ok: false,
      problems: [{ path: 'data.json' }],
    });
    const parent = join(root, 'elsewhere');
    mkdirSync(parent);
    const clean = exportPackage(parent, profile);
    const exported = readFileSync(join(clean, 'data.json'), 'utf8');
    expect(exported).not.toMatch(/password|token|secret/i);
  });
});
