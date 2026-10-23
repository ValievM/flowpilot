import React from 'react';
import type { LocalClock } from '../use-current-time';
import type { PersistedState } from '../use-persisted-tasks';
import type { View } from '../types';
import { RepeatPanel } from './repeat-panel';

export function RepeatSchedule({
  state,
  clock,
  view,
}: {
  readonly state: PersistedState;
  readonly clock: LocalClock;
  readonly view: View;
}): React.JSX.Element | null {
  if (!clock.isReady || (view !== 'today' && view !== 'now')) return null;
  return (
    <RepeatPanel
      series={state.series}
      outcomes={state.outcomes}
      today={clock.today}
      now={clock.now}
      showNow={view === 'now'}
      onOutcome={(seriesId, outcome) => {
        void state.apply([{ kind: 'series.recordOutcome', seriesId, outcome }]);
      }}
      onUpdate={(seriesId, changes) => {
        void state.apply([{ kind: 'series.update', id: seriesId, changes }]);
      }}
      onStop={(seriesId, endDate) => {
        void state.apply([{ kind: 'series.stop', id: seriesId, endDate }]);
      }}
      onReschedule={(seriesId, outcome) => {
        void state.apply([{ kind: 'series.recordOutcome', seriesId, outcome }]);
      }}
    />
  );
}
