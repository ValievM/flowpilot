import type { Series } from '../domain';
import type { PersistedState } from './use-persisted-tasks';

export function createSeries(
  state: PersistedState,
  series: Omit<Series, 'id'>,
): Promise<boolean> {
  return state.apply([
    {
      kind: 'series.create',
      series: {
        ...series,
        weekdays: [...series.weekdays],
        id: crypto.randomUUID(),
      },
    },
  ]);
}
