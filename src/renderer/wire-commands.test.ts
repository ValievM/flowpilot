import { describe, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill';
import { toWireCommands } from './wire-commands';
import type { CommandsApplyRequest } from '../shared/contracts';

describe('toWireCommands', () => {
  it('turns Temporal dates and times into ISO strings before they cross IPC', () => {
    const commands = [
      {
        kind: 'series.create',
        series: {
          id: 'series-1',
          title: 'Тренировка',
          weekdays: [1, 3],
          time: Temporal.PlainTime.from('18:00'),
          startsOn: Temporal.PlainDate.from('2026-10-05'),
          endsOn: Temporal.PlainDate.from('2026-12-31'),
        },
      },
      {
        kind: 'series.recordOutcome',
        seriesId: 'series-1',
        outcome: { kind: 'done', date: Temporal.PlainDate.from('2026-10-05') },
      },
    ] as unknown as CommandsApplyRequest['commands'];

    const wire = toWireCommands(commands);

    expect(wire).toEqual([
      {
        kind: 'series.create',
        series: {
          id: 'series-1',
          title: 'Тренировка',
          weekdays: [1, 3],
          time: '18:00:00',
          startsOn: '2026-10-05',
          endsOn: '2026-12-31',
        },
      },
      {
        kind: 'series.recordOutcome',
        seriesId: 'series-1',
        outcome: { kind: 'done', date: '2026-10-05' },
      },
    ]);
  });

  it('keeps strings, numbers, booleans, nulls and arrays as they are', () => {
    const commands = [
      {
        kind: 'task.update',
        id: 'task-1',
        changes: { description: null, deadline: '2026-10-09' },
      },
      {
        kind: 'subtask.add',
        taskId: 'task-1',
        subtask: { id: 's', title: 'a', completed: false },
      },
    ] as unknown as CommandsApplyRequest['commands'];

    expect(toWireCommands(commands)).toEqual(commands);
  });

  it('does not mutate the commands it was given', () => {
    const date = Temporal.PlainDate.from('2026-10-05');
    const commands = [
      { kind: 'series.stop', id: 'series-1', endDate: date },
    ] as unknown as CommandsApplyRequest['commands'];

    toWireCommands(commands);

    expect((commands[0] as unknown as { endDate: unknown }).endDate).toBe(date);
  });
});
