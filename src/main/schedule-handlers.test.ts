import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from '../storage';
import type { Clock } from '../storage';
import {
  confirmIcsImport,
  createPendingImports,
  listSchedule,
  previewIcsFile,
  type ScheduleDependencies,
} from './schedule-handlers';

const directories: string[] = [];
const clock: Clock = {
  now: () => Temporal.Instant.from('2026-10-05T12:00:00Z'),
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function icsText(withProblem: boolean): string {
  const event = (n: number): string =>
    `BEGIN:VEVENT\nUID:e${String(n)}\nSUMMARY:Занятие ${String(n)}\nDTSTART:2026100${String(n % 10)}T090000Z\nDTEND:2026100${String(n % 10)}T100000Z\nEND:VEVENT\n`;
  const events = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(event).join('');
  const tenth =
    'BEGIN:VEVENT\nUID:e10\nSUMMARY:Десятое\nDTSTART:20261010T090000Z\nDTEND:20261010T100000Z\nEND:VEVENT\n';
  const broken = withProblem
    ? 'BEGIN:VEVENT\nUID:bad\nSUMMARY:Сломанное\nEND:VEVENT\n'
    : '';
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${events}${tenth}${broken}END:VCALENDAR\n`;
}

function setup(content: string, name = 'schedule.ics') {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-schedule-ipc-'));
  directories.push(directory);
  const repository = new Repository(join(directory, 'tasks.sqlite'), clock);
  const path = join(directory, name);
  writeFileSync(path, content);
  const deps: ScheduleDependencies = {
    repository,
    dialogs: { openIcsFile: () => Promise.resolve(path) },
    clock,
    timeZone: 'Europe/Moscow',
    pending: createPendingImports(),
  };
  return { repository, deps, path };
}

describe('schedule IPC handlers', () => {
  it('previews ten events and one problem without touching the database', async () => {
    const { repository, deps } = setup(icsText(true));

    const result = await previewIcsFile({}, deps);

    expect(result).toMatchObject({
      ok: true,
      value: {
        found: 10,
        problemCount: 1,
        firstDate: '2026-10-01',
        lastDate: '2026-10-10',
      },
    });
    expect(result.ok && result.value.problems[0]?.reason).toContain('UID');
    expect(repository.schedule.snapshots()).toEqual([]);
    expect(repository.load().revision).toBe(0);
  });

  it('applies the import only after confirmation and returns the new snapshots', async () => {
    const { repository, deps } = setup(icsText(true));
    const preview = await previewIcsFile({}, deps);
    if (!preview.ok) throw new Error('preview failed');

    const confirmed = confirmIcsImport({ token: preview.value.token }, deps);

    expect(confirmed.ok).toBe(true);
    const snapshots = repository.schedule.snapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ source: 'ics', status: 'ok' });
    expect(snapshots[0]?.events).toHaveLength(10);
    expect(confirmed).toEqual({ ok: true, value: snapshots });
  });

  it('does not let a token be used twice', async () => {
    const { deps } = setup(icsText(false));
    const preview = await previewIcsFile({}, deps);
    if (!preview.ok) throw new Error('preview failed');
    expect(confirmIcsImport({ token: preview.value.token }, deps).ok).toBe(
      true,
    );

    expect(confirmIcsImport({ token: preview.value.token }, deps)).toEqual({
      ok: false,
      error: { kind: 'NotFound' },
    });
  });

  it('reports a cancelled dialog', async () => {
    const { deps } = setup(icsText(false));
    const result = await previewIcsFile(
      {},
      { ...deps, dialogs: { openIcsFile: () => Promise.resolve(undefined) } },
    );
    expect(result).toEqual({ ok: false, error: { kind: 'Cancelled' } });
  });

  it('refuses a file over the size limit', async () => {
    const { deps } = setup(icsText(false));
    const result = await previewIcsFile(
      {},
      { ...deps, files: { size: () => 1_048_577, read: () => '' } },
    );
    expect(result).toEqual({ ok: false, error: { kind: 'TooLarge' } });
  });

  it('refuses a file that is not .ics and a file with no readable events', async () => {
    const wrongName = setup(icsText(false), 'schedule.txt');
    expect(await previewIcsFile({}, wrongName.deps)).toMatchObject({
      ok: false,
      error: { kind: 'IcsInvalid' },
    });
    const garbage = setup('not a calendar at all');
    expect(await previewIcsFile({}, garbage.deps)).toMatchObject({
      ok: false,
      error: { kind: 'IcsInvalid', problems: [expect.anything()] },
    });
  });

  it('rejects a request that carries a path', async () => {
    const { deps, path } = setup(icsText(false));
    expect(await previewIcsFile({ path }, deps)).toEqual({
      ok: false,
      error: { kind: 'ValidationFailed' },
    });
  });

  it('rejects an unknown confirmation token and a malformed request', () => {
    const { repository, deps } = setup(icsText(false));
    expect(confirmIcsImport({ token: 'nope' }, deps)).toEqual({
      ok: false,
      error: { kind: 'NotFound' },
    });
    expect(confirmIcsImport({ token: 'a', extra: 1 }, deps)).toEqual({
      ok: false,
      error: { kind: 'ValidationFailed' },
    });
    expect(repository.schedule.snapshots()).toEqual([]);
  });

  it('lists the stored snapshots', async () => {
    const { deps } = setup(icsText(false));
    expect(listSchedule({}, deps)).toEqual({ ok: true, value: [] });
    const preview = await previewIcsFile({}, deps);
    if (!preview.ok) throw new Error('preview failed');
    confirmIcsImport({ token: preview.value.token }, deps);
    const listed = listSchedule({}, deps);
    expect(listed.ok && listed.value[0]?.source).toBe('ics');
  });

  it('keeps only events: the file itself is not stored in the profile', async () => {
    const { repository, deps } = setup(icsText(false));
    const preview = await previewIcsFile({}, deps);
    if (!preview.ok) throw new Error('preview failed');
    confirmIcsImport({ token: preview.value.token }, deps);
    const stored = JSON.stringify(repository.schedule.snapshots());
    expect(stored).not.toContain('BEGIN:VCALENDAR');
  });
});
