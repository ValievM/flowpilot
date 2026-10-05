import type { FixedEvent } from '../fixed-events';
import { MAX_EVENTS } from './content-lines';
import { firstProperty } from './event-properties';
import { materializeRecurrence } from './recurrence-events';
import { createRecurrencePlan } from './recurrence-plan';
import type { IcsEvent, ParseOptions, ParseProblem } from './types';

interface MasterResult {
  readonly events: readonly FixedEvent[];
  readonly problem?: ParseProblem;
}

function expandMaster(
  master: IcsEvent,
  overrides: readonly IcsEvent[],
  options: ParseOptions,
): MasterResult {
  try {
    const plan = createRecurrencePlan(master, overrides, options);
    return { events: materializeRecurrence(plan) };
  } catch (error) {
    return {
      events: [],
      problem: {
        line: master.line,
        reason:
          error instanceof Error
            ? error.message
            : 'Не удалось разобрать событие.',
      },
    };
  }
}

function missingOverrides(
  overrides: readonly IcsEvent[],
  masters: readonly IcsEvent[],
): ParseProblem[] {
  return overrides.flatMap((override) => {
    const uid = firstProperty(override.properties, 'UID')?.value;
    return masters.some(
      (master) => firstProperty(master.properties, 'UID')?.value === uid,
    )
      ? []
      : [
          {
            line: override.line,
            reason: 'Переопределение не связано с исходным событием.',
          },
        ];
  });
}

export function expandEvents(
  sourceEvents: readonly IcsEvent[],
  options: ParseOptions,
): { events: FixedEvent[]; problems: ParseProblem[] } {
  const masters = sourceEvents.filter(
    (event) => !firstProperty(event.properties, 'RECURRENCE-ID'),
  );
  const overrides = sourceEvents.filter((event) =>
    firstProperty(event.properties, 'RECURRENCE-ID'),
  );
  const events: FixedEvent[] = [];
  const problems: ParseProblem[] = [];
  for (const master of masters) {
    const linked = overrides.filter(
      (event) =>
        firstProperty(event.properties, 'UID')?.value ===
        firstProperty(master.properties, 'UID')?.value,
    );
    const result = expandMaster(master, linked, options);
    events.push(...result.events);
    if (result.problem) problems.push(result.problem);
    if (events.length > MAX_EVENTS) {
      events.length = MAX_EVENTS;
      problems.push({
        line: master.line,
        reason: 'Превышено ограничение в 5000 развёрнутых событий.',
      });
      break;
    }
  }
  problems.push(...missingOverrides(overrides, masters));
  return { events, problems };
}
