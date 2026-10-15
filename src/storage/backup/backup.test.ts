import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Temporal } from 'temporal-polyfill';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { Repository } from '../repository';
import type { Clock } from '../types';
import { exportTo, restore, verifyPackage } from './backup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nativeOpen from '@flowpilot/openat';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachment-store';
import { MAX_DATA_SIZE_BYTES, MAX_PACKAGE_SIZE_BYTES } from './package-files';

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

function zeroHash(sizeBytes: number): string {
  const bytes = Buffer.alloc(64 * 1024);
  const hash = createHash('sha256');
  for (let offset = 0; offset < sizeBytes; offset += bytes.length)
    hash.update(bytes.subarray(0, Math.min(bytes.length, sizeBytes - offset)));
  return hash.digest('hex');
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
  it('restores tasks, AI order, settings and attachment bytes into an empty profile', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [{ kind: 'task.setAiRank', taskId: task.id, rank: 4 }],
        1,
      ).ok,
    ).toBe(true);
    const attachment1 = source(root, 'first.txt', 'first attachment');
    const attachment2 = source(root, 'second.txt', 'second attachment');
    expect(
      repository.apply(
        [
          { kind: 'attachment.add', taskId: task.id, sourcePath: attachment1 },
          { kind: 'attachment.add', taskId: task.id, sourcePath: attachment2 },
        ],
        2,
      ).ok,
    ).toBe(true);
    expect(
      repository.apply(
        [{ kind: 'setting.set', key: 'workdays', value: [1, 2, 3] }],
        3,
      ).ok,
    ).toBe(true);
    const expected = repository.load();
    const attachmentHashes = expected.tasks[0]?.attachments.map(({ id }) =>
      digest(join(root, 'attachments', id)),
    );
    repository.close();
    const packageDir = exportPackage(root, profile);
    const restoredPath = join(root, 'new-profile.sqlite');
    const restoreResult = restore(packageDir, restoredPath, clock);
    expect(restoreResult.ok).toBe(true);
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
  it('round-trips series and outcomes without changing the package format version', () => {
    const { root, profile, repository } = setup();
    const series = {
      id: 'training',
      title: 'Тренировка',
      weekdays: [2, 4],
      time: Temporal.PlainTime.from('18:00'),
      startsOn: Temporal.PlainDate.from('2026-10-06'),
    };
    expect(repository.apply([{ kind: 'series.create', series }], 0).ok).toBe(
      true,
    );
    expect(
      repository.apply(
        [
          {
            kind: 'series.recordOutcome',
            seriesId: series.id,
            outcome: {
              kind: 'rescheduled',
              date: series.startsOn,
              newDate: Temporal.PlainDate.from('2026-10-07'),
              newTime: Temporal.PlainTime.from('19:00'),
            },
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    const expected = repository.load();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const manifest = z
      .object({ formatVersion: z.number() })
      .loose()
      .parse(parsed(join(packageDir, 'manifest.json')));
    const restoredPath = join(root, 'restored-series.sqlite');

    expect(restore(packageDir, restoredPath, clock).ok).toBe(true);
    const restored = new Repository(restoredPath, clock);
    expect(restored.load()).toEqual({
      ...expected,
      revision: expected.revision + 1,
    });
    expect(manifest.formatVersion).toBe(1);
    restored.close();
  });

  it('reads older format-version-one packages without series sections', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = parsed(join(packageDir, 'data.json')) as Record<
      string,
      unknown
    >;
    delete data.series;
    delete data.outcomes;
    save(join(packageDir, 'data.json'), data);
    updateDataHash(packageDir);
    const restoredPath = join(root, 'restored-legacy.sqlite');

    expect(verifyPackage(packageDir).ok).toBe(true);
    expect(restore(packageDir, restoredPath, clock).ok).toBe(true);
    const restored = new Repository(restoredPath, clock);
    expect(restored.load().series).toEqual([]);
    expect(restored.load().outcomes).toEqual([]);
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
  it('rejects a backup with an inverted series range without replacing the profile', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'series.create',
            series: {
              id: 'series-1',
              title: 'Серия',
              weekdays: [1],
              startsOn: Temporal.PlainDate.from('2026-10-06'),
            },
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    const expected = repository.load();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = z
      .object({
        series: z.array(
          z
            .object({
              starts_on: z.string(),
              ends_on: z.string().nullable(),
            })
            .loose(),
        ),
      })
      .loose()
      .parse(parsed(join(packageDir, 'data.json')));
    const series = data.series[0];
    if (!series) throw new Error('missing exported series');
    series.ends_on = '2026-10-05';
    save(join(packageDir, 'data.json'), data);
    updateDataHash(packageDir);

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

  it('preserves a pre-existing export staging directory after a collision', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const staging = join(
      root,
      `FlowPilot-export-2026-10-06.tmp-${String(process.pid)}`,
    );
    mkdirSync(staging);
    writeFileSync(join(staging, 'keep.txt'), 'do not delete');

    expect(exportTo(root, profile, clock)).toMatchObject({ ok: false });
    expect(readFileSync(join(staging, 'keep.txt'), 'utf8')).toBe(
      'do not delete',
    );
  });

  it('rejects symlinked attachment parents without touching external files', () => {
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
    const externalPath = join(root, 'external');
    const attachmentId = z
      .object({ attachments: z.array(z.object({ id: z.string() })) })
      .parse(parsed(join(packageDir, 'data.json'))).attachments[0]?.id;
    if (!attachmentId) throw new Error('Missing attachment fixture');
    const attachmentBytes = readFileSync(
      join(packageDir, 'attachments', attachmentId),
    );
    mkdirSync(externalPath);
    writeFileSync(join(externalPath, attachmentId), attachmentBytes);
    writeFileSync(join(externalPath, 'sentinel'), 'external data');
    rmSync(join(packageDir, 'attachments'), { recursive: true });
    symlinkSync(externalPath, join(packageDir, 'attachments'));

    expect(verifyPackage(packageDir).ok).toBe(false);
    expect(restore(packageDir, join(root, 'restored.sqlite'), clock).ok).toBe(
      false,
    );
    expect(readFileSync(join(externalPath, 'sentinel'), 'utf8')).toBe(
      'external data',
    );
    expect(readdirSync(externalPath)).toEqual([attachmentId, 'sentinel']);
  });

  it('rejects a symlinked attachment file before restore copies it', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'attachment.add',
            taskId: task.id,
            sourcePath: source(root, 'file.txt', 'external attachment'),
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const attachmentId = z
      .object({ attachments: z.array(z.object({ id: z.string() })) })
      .parse(parsed(join(packageDir, 'data.json'))).attachments[0]?.id;
    if (!attachmentId) throw new Error('Missing attachment fixture');
    const externalPath = join(root, 'external-attachment');
    const attachmentPath = join(packageDir, 'attachments', attachmentId);
    const bytes = readFileSync(attachmentPath);
    writeFileSync(externalPath, bytes);
    rmSync(attachmentPath);
    symlinkSync(externalPath, attachmentPath);

    expect(verifyPackage(packageDir).ok).toBe(false);
    expect(restore(packageDir, join(root, 'restored.sqlite'), clock).ok).toBe(
      false,
    );
    expect(readFileSync(externalPath)).toEqual(bytes);
  });

  it('rejects symlinked manifest and data JSON files', () => {
    for (const filename of ['manifest.json', 'data.json']) {
      const { root, profile, repository } = setup();
      repository.close();
      const packageDir = exportPackage(root, profile);
      const packageFile = join(packageDir, filename);
      const externalPath = join(root, `external-${filename}`);
      const bytes = readFileSync(packageFile);
      writeFileSync(externalPath, bytes);
      rmSync(packageFile);
      symlinkSync(externalPath, packageFile);

      expect(verifyPackage(packageDir).ok).toBe(false);
    }
  });

  it('refuses export when stored attachment bytes no longer match metadata', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'attachment.add',
            taskId: task.id,
            sourcePath: source(root, 'file.txt', 'original'),
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    const attachmentId = repository.load().tasks[0]?.attachments[0]?.id;
    repository.close();
    if (!attachmentId) throw new Error('Missing attachment fixture');
    writeFileSync(join(root, 'attachments', attachmentId), 'tampered');

    expect(exportTo(root, profile, clock)).toMatchObject({ ok: false });
    expect(
      readdirSync(root).filter((name) => name.startsWith('FlowPilot-export-')),
    ).toEqual([]);
  });

  it('accepts an attachment exactly at the storage size limit', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'attachment.add',
            taskId: task.id,
            sourcePath: source(root, 'file.txt', 'small'),
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = z
      .object({ attachments: z.array(z.record(z.string(), z.unknown())) })
      .loose()
      .parse(parsed(join(packageDir, 'data.json')));
    const record = data.attachments[0];
    if (!record) throw new Error('Missing attachment fixture');
    const id = String(record.id);
    const sha256 = zeroHash(MAX_ATTACHMENT_SIZE_BYTES);
    record.size_bytes = MAX_ATTACHMENT_SIZE_BYTES;
    record.sha256 = sha256;
    save(join(packageDir, 'data.json'), data);
    writeFileSync(join(packageDir, 'attachments', id), Buffer.alloc(0));
    truncateSync(
      join(packageDir, 'attachments', id),
      MAX_ATTACHMENT_SIZE_BYTES,
    );
    updateDataHash(packageDir);
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
    const file = manifest.files.find(
      (item) => item.path === `attachments/${id}`,
    );
    if (!file) throw new Error('Missing attachment manifest fixture');
    file.sizeBytes = MAX_ATTACHMENT_SIZE_BYTES;
    file.sha256 = sha256;
    save(join(packageDir, 'manifest.json'), manifest);

    expect(verifyPackage(packageDir).ok).toBe(true);
  });

  it('rejects a valid sparse attachment one byte above the storage limit', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'attachment.add',
            taskId: task.id,
            sourcePath: source(root, 'file.txt', 'small'),
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    const original = repository.load();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const data = z
      .object({ attachments: z.array(z.record(z.string(), z.unknown())) })
      .loose()
      .parse(parsed(join(packageDir, 'data.json')));
    const record = data.attachments[0];
    if (!record) throw new Error('Missing attachment fixture');
    const id = String(record.id);
    const sizeBytes = MAX_ATTACHMENT_SIZE_BYTES + 1;
    const sha256 = zeroHash(sizeBytes);
    record.size_bytes = sizeBytes;
    record.sha256 = sha256;
    save(join(packageDir, 'data.json'), data);
    writeFileSync(join(packageDir, `attachments/${id}`), Buffer.alloc(0));
    truncateSync(join(packageDir, `attachments/${id}`), sizeBytes);
    updateDataHash(packageDir);
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
    const attachment = manifest.files.find(
      (file) => file.path === `attachments/${id}`,
    );
    if (!attachment) throw new Error('Missing attachment manifest fixture');
    attachment.sizeBytes = sizeBytes;
    attachment.sha256 = sha256;
    save(join(packageDir, 'manifest.json'), manifest);

    expect(verifyPackage(packageDir)).toMatchObject({
      ok: false,
      problems: [{ message: 'Размер файла превышает лимит' }],
    });
    expect(restore(packageDir, profile, clock).ok).toBe(false);
    const current = new Repository(profile, clock);
    expect(current.load()).toEqual(original);
    current.close();
  });

  it('rejects a manifest whose declared files exceed the package size limit', () => {
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
    for (let index = 0; index < 6; index += 1)
      manifest.files.push({
        path: `attachments/oversize-${String(index)}`,
        sha256: '0'.repeat(64),
        sizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
      });
    expect(
      manifest.files.reduce((total, file) => total + file.sizeBytes, 0),
    ).toBeGreaterThan(MAX_PACKAGE_SIZE_BYTES);
    save(join(packageDir, 'manifest.json'), manifest);

    expect(verifyPackage(packageDir)).toMatchObject({
      ok: false,
      problems: [
        { path: 'manifest.json', message: 'Размер пакета превышает лимит' },
      ],
    });
  });

  it('rejects oversized data JSON by its stat size before parsing it', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const dataPath = join(packageDir, 'data.json');
    truncateSync(dataPath, MAX_DATA_SIZE_BYTES + 1);
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
    const dataFile = manifest.files.find((file) => file.path === 'data.json');
    if (!dataFile) throw new Error('Missing data manifest fixture');
    dataFile.sizeBytes = MAX_DATA_SIZE_BYTES + 1;
    save(join(packageDir, 'manifest.json'), manifest);

    expect(verifyPackage(packageDir)).toMatchObject({
      ok: false,
      problems: [
        { path: 'manifest.json', message: 'Размер файла превышает лимит' },
      ],
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
  it('rejects active rule state that disagrees with its archived version', () => {
    const rule = {
      schema_version: 'v1',
      id: 'backup-rule',
      title: 'Правило',
      scope: { task_type_ids: ['type-1'] },
      rules: [
        { id: 'priority', kind: 'priority', level: 'high', reason: 'Важно' },
      ],
    };
    const { root, profile, repository } = setup();
    expect(
      repository.apply(
        [
          { kind: 'taskType.create', taskType: { id: 'type-1', name: 'Тип' } },
          { kind: 'rule.import', documentJson: JSON.stringify(rule) },
          { kind: 'rule.activate', ruleId: rule.id },
        ],
        0,
      ).ok,
    ).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const dataPath = join(packageDir, 'data.json');
    const data = z
      .object({
        rules: z.array(z.record(z.string(), z.unknown())),
        rule_versions: z.array(z.record(z.string(), z.unknown())),
      })
      .loose()
      .parse(parsed(dataPath));
    const storedRule = data.rules[0];
    if (!storedRule) throw new Error('Missing rule backup fixture');
    storedRule.active_version = 99;
    save(dataPath, data);
    updateDataHash(packageDir);

    const verification = verifyPackage(packageDir);

    expect(verification.ok).toBe(false);
    if (!verification.ok)
      expect(verification.problems[0]?.message).toContain(
        'активную версию правила',
      );
    storedRule.active_version = 1;
    storedRule.active_document_json = '{}';
    save(dataPath, data);
    updateDataHash(packageDir);

    const mismatchedDocument = verifyPackage(packageDir);

    expect(mismatchedDocument.ok).toBe(false);
    if (!mismatchedDocument.ok)
      expect(mismatchedDocument.problems[0]?.message).toContain(
        'не совпадает с архивом',
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

  it('keeps the current profile and removes staging files when backup replacement fails', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    const before = repository.load();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const collision = `${profile}.before-restore-${clock.now().toString().replaceAll(':', '-')}`;
    writeFileSync(collision, 'preserve this backup');

    expect(restore(packageDir, profile, clock).ok).toBe(false);
    const current = new Repository(profile, clock);
    expect(current.load()).toEqual(before);
    current.close();
    expect(readFileSync(collision, 'utf8')).toBe('preserve this backup');
    expect(
      readdirSync(root).filter((name) => name.includes('.restore-stage-')),
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
  it('does not undo a restore or skip it, then undoes the next user edit', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    const attachment = source(root, 'restored.txt', 'restored attachment');
    expect(
      repository.apply(
        [{ kind: 'attachment.add', taskId: task.id, sourcePath: attachment }],
        1,
      ).ok,
    ).toBe(true);
    repository.close();
    const packageDir = exportPackage(root, profile);
    const restoreResult = restore(packageDir, profile, clock);
    expect(restoreResult.ok).toBe(true);
    if (!restoreResult.ok) throw new Error('Restore should succeed');
    expect(restoreResult.value).toContain('.before-restore-');

    const current = new Repository(profile, clock);
    const beforeUndo = current.load();
    const attachmentPath = join(
      root,
      'attachments',
      beforeUndo.tasks[0]?.attachments[0]?.id ?? '',
    );
    const attachmentBytes = readFileSync(attachmentPath);
    const historyBeforeUndo = current.history(10);

    const undoResult = current.undo();
    expect(undoResult).toMatchObject({
      ok: false,
      error: { kind: 'NotUndoable' },
    });
    if (undoResult.ok || undoResult.error.kind !== 'NotUndoable')
      throw new Error('Restore undo should be rejected as not undoable');
    expect(undoResult.error.reason).toContain(
      `восстановление нельзя отменить; прежние данные сохранены в ${profile}.before-restore-`,
    );
    expect(current.load()).toEqual(beforeUndo);
    expect(readFileSync(attachmentPath)).toEqual(attachmentBytes);
    expect(current.history(10)).toEqual(historyBeforeUndo);

    expect(
      current.apply(
        [{ kind: 'task.update', id: task.id, changes: { title: 'Правка' } }],
        beforeUndo.revision,
      ).ok,
    ).toBe(true);
    expect(current.undo()).toMatchObject({ ok: true });
    expect(current.load().tasks[0]?.title).toBe(task.title);
    expect(current.load().revision).toBe(beforeUndo.revision + 2);
    expect(current.history(10).entries.map(({ source }) => source)).toEqual([
      'undo',
      'user',
      'restore',
    ]);
    current.close();
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
  it('rejects export from a symlinked profile attachment directory', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'attachment.add',
            taskId: task.id,
            sourcePath: source(root, 'safe.txt', 'safe bytes'),
          },
        ],
        1,
      ).ok,
    ).toBe(true);
    repository.close();
    const original = join(root, 'attachments');
    const external = join(root, 'external-attachments');
    renameSync(original, external);
    symlinkSync(external, original);

    expect(exportTo(root, profile, clock)).toMatchObject({ ok: false });
    expect(
      readFileSync(join(external, readdirSync(external)[0] ?? ''), 'utf8'),
    ).toBe('safe bytes');
  });

  it('does not hash underdeclared files after their actual package size exceeds the budget', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const attachmentDir = join(packageDir, 'attachments');
    mkdirSync(attachmentDir);
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
    for (let index = 0; index < 6; index += 1) {
      const name = `sparse-${String(index)}`;
      writeFileSync(join(attachmentDir, name), Buffer.alloc(0));
      truncateSync(join(attachmentDir, name), MAX_ATTACHMENT_SIZE_BYTES);
      manifest.files.push({
        path: `attachments/${name}`,
        sha256: '0'.repeat(64),
        sizeBytes: 0,
      });
    }
    save(join(packageDir, 'manifest.json'), manifest);

    expect(verifyPackage(packageDir)).toMatchObject({
      ok: false,
      problems: [
        { path: 'manifest.json', message: 'Размер пакета превышает лимит' },
      ],
    });
  });

  it('uses the exact retained backup path in restore output and undo reason', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    let calls = 0;
    const changingClock: Clock = {
      now: () => {
        calls += 1;
        return Temporal.Instant.from(
          calls === 1 ? '2026-10-06T12:00:00Z' : '2026-10-06T12:00:01Z',
        );
      },
    };

    const restored = restore(packageDir, profile, changingClock);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error('Restore should succeed');
    const backupPath = `${profile}.before-restore-2026-10-06T12-00-00Z`;
    expect(restored.value).toContain(backupPath);
    expect(readdirSync(root)).toContain(backupPath.split('/').at(-1));
    const current = new Repository(profile, clock);
    const undo = current.undo();
    expect(undo).toMatchObject({ ok: false, error: { kind: 'NotUndoable' } });
    if (undo.ok || undo.error.kind !== 'NotUndoable')
      throw new Error('Restore must not be undoable');
    expect(undo.error.reason).toContain(backupPath);
    current.close();
  });

  it('does not report an old-profile backup when restoring into an absent profile', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const packageDir = exportPackage(root, profile);
    const target = join(root, 'new-profile.sqlite');

    const restored = restore(packageDir, target, clock);
    expect(restored).toMatchObject({ ok: true });
    if (!restored.ok) throw new Error('Restore should succeed');
    expect(restored.value).not.toContain('.before-restore-');
    const current = new Repository(target, clock);
    const undo = current.undo();
    expect(undo).toMatchObject({ ok: false, error: { kind: 'NotUndoable' } });
    if (undo.ok || undo.error.kind !== 'NotUndoable')
      throw new Error('Restore must not be undoable');
    expect(undo.error.reason).not.toContain('.before-restore-');
    current.close();
  });
  it('stops exporting data when serialized content exceeds the data limit', () => {
    const { root, profile, repository } = setup();
    repository.close();
    const database = new Database(profile);
    database
      .prepare('INSERT INTO settings(key,value_json) VALUES(?,?)')
      .run(
        'large-fixture',
        JSON.stringify('x'.repeat(MAX_DATA_SIZE_BYTES + 1)),
      );
    database.close();

    expect(exportTo(root, profile, clock)).toMatchObject({ ok: false });
    expect(
      readdirSync(root).filter((name) => name.startsWith('FlowPilot-export-')),
    ).toEqual([]);
  });
  it('rejects aggregate attachment bytes before copying an over-budget export', () => {
    const { root, profile, repository } = setup();
    expect(repository.apply([{ kind: 'task.create', task }], 0).ok).toBe(true);
    repository.close();
    mkdirSync(join(root, 'attachments'));
    const database = new Database(profile);
    const insert = database.prepare(
      'INSERT INTO attachments(id,task_id,name,media_type,size_bytes,position,sha256,created_at) VALUES(?,?,?,?,?,?,?,?)',
    );
    const attachmentHash = zeroHash(MAX_ATTACHMENT_SIZE_BYTES);
    for (let index = 0; index < 6; index += 1) {
      const id = `sparse-${String(index)}`;
      insert.run(
        id,
        task.id,
        `${id}.txt`,
        'text/plain',
        MAX_ATTACHMENT_SIZE_BYTES,
        index,
        attachmentHash,
        clock.now().toString(),
      );
      writeFileSync(join(root, 'attachments', id), Buffer.alloc(0));
      truncateSync(join(root, 'attachments', id), MAX_ATTACHMENT_SIZE_BYTES);
    }
    database.close();

    const originalOpenAt = nativeOpen.openAt.bind(nativeOpen);
    const openCounts = new Map<string, number>();
    const copyAttempt = vi
      .spyOn(nativeOpen, 'openAt')
      .mockImplementation((directoryFd, name, flags, mode) => {
        if (name.startsWith('sparse-')) {
          const count = (openCounts.get(name) ?? 0) + 1;
          openCounts.set(name, count);
          if (count > 1) {
            throw new Error(
              'Attachment copy started before aggregate preflight',
            );
          }
        }
        return originalOpenAt(directoryFd, name, flags, mode);
      });
    const result = (() => {
      try {
        return exportTo(root, profile, clock);
      } finally {
        copyAttempt.mockRestore();
      }
    })();

    expect(result).toMatchObject({
      ok: false,
      error: 'Размер пакета превышает лимит',
    });
    expect([...openCounts.values()]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(
      readdirSync(root).filter((name) => name.startsWith('FlowPilot-export-')),
    ).toEqual([]);
  });
});
