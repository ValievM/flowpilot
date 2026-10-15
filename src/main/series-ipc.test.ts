import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from 'temporal-polyfill';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCommands, loadSnapshot } from './handlers';
import { commandsApplyRequestSchema } from '../shared/contracts';
import { Repository } from '../storage/repository';

const directories: string[] = [];
const clock = { now: () => Temporal.Instant.from('2026-10-06T12:00:00Z') };

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('series IPC contract', () => {
  it('validates narrow series commands and serializes recurrence dates in snapshots', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flowpilot-series-ipc-'));
    directories.push(directory);
    const repository = new Repository(join(directory, 'profile.sqlite'), clock);
    const request = commandsApplyRequestSchema.safeParse({
      expectedRevision: 0,
      commands: [
        {
          kind: 'series.create',
          series: {
            id: 'training',
            title: 'Тренировка',
            weekdays: [2, 4],
            time: '18:00',
            startsOn: '2026-10-06',
          },
        },
      ],
    });
    expect(request.success).toBe(true);
    if (!request.success) throw new Error('Expected valid recurrence command');
    expect(
      applyCommands(
        {
          expectedRevision: 0,
          commands: [
            {
              kind: 'series.create',
              series: {
                id: 'training',
                title: 'Тренировка',
                weekdays: [2, 4],
                time: '18:00',
                startsOn: '2026-10-06',
              },
            },
          ],
        },
        { repository },
      ).ok,
    ).toBe(true);
    expect(
      repository.apply(
        [
          {
            kind: 'series.recordOutcome',
            seriesId: 'training',
            outcome: {
              kind: 'done',
              date: Temporal.PlainDate.from('2026-10-06'),
            },
          },
        ],
        1,
      ).ok,
    ).toBe(true);

    const result = loadSnapshot({}, { repository });

    expect(result).toMatchObject({
      ok: true,
      value: {
        series: [{ id: 'training', startsOn: '2026-10-06', time: '18:00:00' }],
        outcomes: [
          {
            kind: 'done',
            date: '2026-10-06',
            recordedAt: '2026-10-06T12:00:00Z',
          },
        ],
      },
    });
    expect(
      commandsApplyRequestSchema.safeParse({
        expectedRevision: 0,
        commands: [
          {
            kind: 'series.stop',
            id: 'training',
            endDate: '2026-10-06',
            extra: true,
          },
        ],
      }).success,
    ).toBe(false);
    repository.close();
  });
});
