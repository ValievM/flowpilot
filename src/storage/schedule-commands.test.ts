import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T12:00:00Z') };

function openRepository(): { repository: Repository; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-schedule-'));
  directories.push(directory);
  const path = join(directory, 'tasks.sqlite');
  return { repository: new Repository(path, clock), path };
}

function event(
  overrides: Partial<{
    key: string;
    source: 'modeus' | 'ics';
    title: string;
    startUtc: string;
    endUtc: string;
    timeZone: string;
    place: string;
    cancelled: boolean;
  }> = {},
) {
  return {
    key: 'class-1',
    source: 'ics' as const,
    title: 'Лекция',
    startUtc: '2026-10-07T09:00:00Z',
    endUtc: '2026-10-07T10:30:00Z',
    timeZone: 'Europe/Moscow',
    ...overrides,
  };
}

function manualEvent(id = 'manual-1') {
  return {
    id,
    title: 'Тренировка',
    timeZone: 'Europe/Moscow',
    weekdays: [1, 3],
    startTime: '18:30',
    endTime: '19:30',
    fromDate: '2026-10-05',
    throughDate: '2026-12-31',
  } as const;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('schedule storage commands', () => {
  it('upserts repeated imports and replaces a changed event without duplication', () => {
    const { repository } = openRepository();
    expect(
      repository.schedule.importSchedule(
        'ics',
        [event()],
        '2026-10-06T12:00:00Z',
        0,
      ).ok,
    ).toBe(true);
    expect(
      repository.schedule.importSchedule(
        'ics',
        [event()],
        '2026-10-06T12:01:00Z',
        1,
      ).ok,
    ).toBe(true);
    expect(
      repository.schedule.importSchedule(
        'ics',
        [
          event({
            title: 'Лекция перенесена',
            startUtc: '2026-10-07T10:00:00Z',
          }),
        ],
        '2026-10-06T12:02:00Z',
        2,
      ).ok,
    ).toBe(true);
    const snapshot = repository.schedule.snapshots()[0];
    expect(snapshot?.events).toHaveLength(1);
    expect(snapshot?.events[0]).toMatchObject({
      title: 'Лекция перенесена',
      startUtc: '2026-10-07T10:00:00Z',
    });
    repository.close();
  });

  it('keeps the last successful events and fetched time after a source error', () => {
    const { repository } = openRepository();
    repository.schedule.importSchedule(
      'ics',
      [event()],
      '2026-10-05T12:00:00Z',
      0,
    );
    repository.schedule.recordScheduleError(
      'ics',
      'Источник недоступен',
      '2026-10-07T12:00:00Z',
      1,
    );
    expect(repository.schedule.snapshots()[0]).toMatchObject({
      fetchedAt: '2026-10-05T12:00:00Z',
      status: 'error',
      lastError: 'Источник недоступен',
      ageMilliseconds: 86_400_000,
      events: [event()],
    });
    repository.close();
  });

  it('persists manual weekday events across restart without removing imported events', () => {
    const { repository, path } = openRepository();
    repository.schedule.importSchedule(
      'ics',
      [event()],
      '2026-10-06T12:00:00Z',
      0,
    );
    repository.schedule.addManualEvent(manualEvent(), 1);
    const updated = { ...manualEvent(), title: 'Тренировка обновлена' };
    expect(
      repository.schedule.updateManualEvent('manual-1', updated, 2).ok,
    ).toBe(true);
    repository.close();
    const reopened = new Repository(path, clock);
    expect(reopened.schedule.snapshots()).toEqual([
      expect.objectContaining({
        source: 'ics',
        events: [event()],
      }),
      expect.objectContaining({
        source: 'manual',
        events: [updated],
      }),
    ]);
    reopened.schedule.removeManualEvent('manual-1', 3);
    expect(
      reopened.schedule.snapshots().find(({ source }) => source === 'ics')
        ?.events,
    ).toEqual([event()]);
    expect(
      reopened.schedule.snapshots().find(({ source }) => source === 'manual')
        ?.events,
    ).toEqual([]);
    reopened.close();
  });

  it('undoes a complete schedule import as one persistent history entry', () => {
    const { repository } = openRepository();
    repository.schedule.importSchedule(
      'ics',
      [event()],
      '2026-10-06T12:00:00Z',
      0,
    );
    const entry = repository.history(1).entries[0];
    if (!entry) throw new Error('Expected schedule import history entry');
    expect(repository.undo(entry.id)).toEqual({
      ok: true,
      value: { revision: 2 },
    });
    expect(repository.schedule.snapshots()).toEqual([]);
    expect(repository.history(2).entries.map(({ source }) => source)).toEqual([
      'undo',
      'user',
    ]);
    repository.close();
  });

  it('rejects a stale revision without deleting future imported events', () => {
    const { repository } = openRepository();
    repository.schedule.importSchedule(
      'ics',
      [event()],
      '2026-10-06T12:00:00Z',
      0,
    );
    expect(
      repository.schedule.importSchedule('ics', [], '2026-10-06T12:01:00Z', 0),
    ).toEqual({
      ok: false,
      error: { kind: 'StaleRevision', expected: 0, actual: 1 },
    });
    expect(repository.schedule.snapshots()[0]?.events).toEqual([event()]);
    repository.close();
  });

  it('stores the same instant independently of the event time zone', () => {
    const { repository } = openRepository();
    repository.schedule.importSchedule(
      'ics',
      [
        event({
          startUtc: '2026-10-07T11:00:00+02:00',
          timeZone: 'Europe/Paris',
        }),
      ],
      '2026-10-06T12:00:00Z',
      0,
    );
    expect(repository.schedule.snapshots()[0]?.events[0]).toMatchObject({
      startUtc: '2026-10-07T09:00:00Z',
      timeZone: 'Europe/Paris',
    });
    repository.close();
  });

  it('deletes future events on an empty successful import but not on an error', () => {
    const { repository } = openRepository();
    repository.schedule.importSchedule(
      'ics',
      [event()],
      '2026-10-06T12:00:00Z',
      0,
    );
    repository.schedule.importSchedule('ics', [], '2026-10-06T12:01:00Z', 1);
    expect(repository.schedule.snapshots()[0]?.events).toEqual([]);
    repository.schedule.importSchedule(
      'ics',
      [event()],
      '2026-10-06T12:02:00Z',
      2,
    );
    repository.schedule.recordScheduleError(
      'ics',
      'Ошибка чтения',
      '2026-10-06T12:03:00Z',
      3,
    );
    expect(repository.schedule.snapshots()[0]?.events).toEqual([event()]);
    repository.close();
  });
});
