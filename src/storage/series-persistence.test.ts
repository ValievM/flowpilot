import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import type { Series } from '../domain';
import { migrate } from './migrate';
import { Repository } from './repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T12:00:00Z') };
const series: Series = {
  id: 'training',
  title: 'Тренировка',
  weekdays: [2, 4],
  time: Temporal.PlainTime.from('18:00'),
  startsOn: Temporal.PlainDate.from('2026-10-06'),
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function openRepository(): { repository: Repository; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'flowpilot-series-'));
  directories.push(directory);
  const path = join(directory, 'profile.sqlite');
  return { repository: new Repository(path, clock), path };
}
function tableColumns(
  database: Database.Database,
  table: 'series' | 'series_outcomes',
): string[] {
  return (
    database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map(({ name }) => name);
}

describe('series persistence migration', () => {
  it('upgrades a version-ten database with series and outcomes tables', () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'flowpilot-series-migration-'),
    );
    directories.push(directory);
    const path = join(directory, 'profile.sqlite');
    const database = new Database(path);
    database.pragma('user_version = 10');

    migrate(database, path);

    try {
      expect(database.pragma('user_version')).toEqual([{ user_version: 11 }]);
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('series','series_outcomes') ORDER BY name",
          )
          .all(),
      ).toEqual([{ name: 'series' }, { name: 'series_outcomes' }]);
      expect(tableColumns(database, 'series')).toEqual(
        expect.arrayContaining([
          'id',
          'title',
          'description',
          'weekdays_json',
          'time',
          'starts_on',
          'ends_on',
          'version',
          'created_at',
          'updated_at',
        ]),
      );
      expect(tableColumns(database, 'series_outcomes')).toEqual(
        expect.arrayContaining([
          'series_id',
          'date',
          'kind',
          'new_date',
          'new_time',
          'version',
          'recorded_at',
        ]),
      );
      expect(
        database.prepare('PRAGMA foreign_key_list(series_outcomes)').all(),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'series', from: 'series_id' }),
        ]),
      );
    } finally {
      database.close();
    }
  });
});

describe('series and outcome persistence', () => {
  it('restores a created series from the database after restart', () => {
    const { repository, path } = openRepository();
    expect(repository.apply([{ kind: 'series.create', series }], 0).ok).toBe(
      true,
    );
    repository.close();

    const reopened = new Repository(path, clock);

    expect(reopened.load().series).toEqual([series]);
    reopened.close();
  });

  it('keeps repeated identical outcomes as one unchanged record', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'series.create', series }], 0);
    const command = {
      kind: 'series.recordOutcome' as const,
      seriesId: series.id,
      outcome: { kind: 'done' as const, date: series.startsOn },
    };

    expect(repository.apply([command], 1).ok).toBe(true);
    expect(repository.apply([command], 2).ok).toBe(true);
    expect(repository.load().outcomes).toHaveLength(1);
    expect(repository.load().outcomes[0]?.kind).toBe('done');
    repository.close();
  });

  it('replaces an outcome for the same occurrence using the domain latest-outcome rule', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'series.create', series }], 0);
    repository.apply(
      [
        {
          kind: 'series.recordOutcome',
          seriesId: series.id,
          outcome: { kind: 'done', date: series.startsOn },
        },
      ],
      1,
    );

    const result = repository.apply(
      [
        {
          kind: 'series.recordOutcome',
          seriesId: series.id,
          outcome: { kind: 'skipped', date: series.startsOn },
        },
      ],
      2,
    );

    expect(result.ok).toBe(true);
    expect(repository.load().outcomes).toMatchObject([{ kind: 'skipped' }]);
    repository.close();
  });

  it('stops a series without removing its previous outcomes', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'series.create', series }], 0);
    repository.apply(
      [
        {
          kind: 'series.recordOutcome',
          seriesId: series.id,
          outcome: { kind: 'done', date: series.startsOn },
        },
      ],
      1,
    );

    const stopped = repository.apply(
      [{ kind: 'series.stop', id: series.id, endDate: series.startsOn }],
      2,
    );

    expect(stopped.ok).toBe(true);
    expect(repository.load().series[0]?.endsOn?.toString()).toBe('2026-10-06');
    expect(repository.load().outcomes).toHaveLength(1);
    repository.close();
  });

  it('undoes outcome changes to the previous occurrence state', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'series.create', series }], 0);
    repository.apply(
      [
        {
          kind: 'series.recordOutcome',
          seriesId: series.id,
          outcome: { kind: 'done', date: series.startsOn },
        },
      ],
      1,
    );
    const entry = repository.history(10).entries[0];
    if (!entry) throw new Error('Expected outcome history entry');
    repository.apply(
      [
        {
          kind: 'series.recordOutcome',
          seriesId: series.id,
          outcome: { kind: 'skipped', date: series.startsOn },
        },
      ],
      2,
    );

    expect(repository.undo(entry.id)).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    const current = repository.history(10).entries[0];
    if (!current) throw new Error('Expected latest outcome history entry');
    expect(repository.undo(current.id)).toMatchObject({ ok: true });
    expect(repository.load().outcomes).toMatchObject([{ kind: 'done' }]);
    repository.close();
  });

  it('undoes a series creation while preventing removal of a series with outcomes', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'series.create', series }], 0);
    const creation = repository.history(10).entries[0];
    if (!creation) throw new Error('Expected series creation history entry');
    expect(repository.undo(creation.id)).toMatchObject({ ok: true });
    expect(repository.load().series).toEqual([]);
    repository.apply([{ kind: 'series.create', series }], 2);
    repository.apply(
      [
        {
          kind: 'series.recordOutcome',
          seriesId: series.id,
          outcome: { kind: 'done', date: series.startsOn },
        },
      ],
      3,
    );
    const secondCreation = repository.history(10).entries[1];
    if (!secondCreation)
      throw new Error('Expected second series creation history entry');

    expect(repository.undo(secondCreation.id)).toMatchObject({
      ok: false,
      error: { kind: 'UndoConflict' },
    });
    expect(repository.load().series).toHaveLength(1);
    repository.close();
  });

  it('rejects outcome writes for an absent series', () => {
    const { repository } = openRepository();

    expect(
      repository.apply(
        [
          {
            kind: 'series.recordOutcome',
            seriesId: 'missing',
            outcome: { kind: 'done', date: series.startsOn },
          },
        ],
        0,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidCommand' } });
    repository.close();
  });

  it('rejects a stale series revision without changing its state', () => {
    const { repository } = openRepository();
    repository.apply([{ kind: 'series.create', series }], 0);

    expect(
      repository.apply(
        [{ kind: 'series.stop', id: series.id, endDate: series.startsOn }],
        0,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'StaleRevision' } });
    expect(repository.load().series).toEqual([series]);
    repository.close();
  });

  it('rejects a series with an empty set of weekdays', () => {
    const { repository } = openRepository();

    expect(
      repository.apply(
        [{ kind: 'series.create', series: { ...series, weekdays: [] } }],
        0,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidCommand' } });
    expect(repository.load().series).toEqual([]);
    repository.close();
  });

  it('undoes a batch that creates a series and an outcome together', () => {
    const { repository } = openRepository();
    const result = repository.apply(
      [
        { kind: 'series.create', series },
        {
          kind: 'series.recordOutcome',
          seriesId: series.id,
          outcome: { kind: 'done', date: series.startsOn },
        },
      ],
      0,
    );
    expect(result.ok).toBe(true);
    const creation = repository.history(10).entries[0];
    if (!creation) throw new Error('Expected batch creation history entry');

    expect(repository.undo(creation.id)).toMatchObject({ ok: true });
    expect(repository.load().series).toEqual([]);
    expect(repository.load().outcomes).toEqual([]);
    repository.close();
  });

  it('rejects a series whose end precedes its start on create, update, or stop', () => {
    const { repository } = openRepository();
    const earlierDate = Temporal.PlainDate.from('2026-10-05');
    expect(
      repository.apply(
        [
          {
            kind: 'series.create',
            series: { ...series, endsOn: earlierDate },
          },
        ],
        0,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidCommand' } });

    repository.apply([{ kind: 'series.create', series }], 0);
    expect(
      repository.apply(
        [
          {
            kind: 'series.update',
            id: series.id,
            changes: { endsOn: earlierDate },
          },
        ],
        1,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidCommand' } });
    expect(
      repository.apply(
        [{ kind: 'series.stop', id: series.id, endDate: earlierDate }],
        1,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidCommand' } });
    expect(repository.load().series).toEqual([series]);
    repository.close();
  });

  it('rejects an update that moves the start beyond the existing end', () => {
    const { repository } = openRepository();
    repository.apply(
      [
        {
          kind: 'series.create',
          series: {
            ...series,
            endsOn: Temporal.PlainDate.from('2026-10-08'),
          },
        },
      ],
      0,
    );

    expect(
      repository.apply(
        [
          {
            kind: 'series.update',
            id: series.id,
            changes: { startsOn: Temporal.PlainDate.from('2026-10-09') },
          },
        ],
        1,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'InvalidCommand' } });
    expect(repository.load().series[0]?.startsOn.toString()).toBe('2026-10-06');
    repository.close();
  });
});
