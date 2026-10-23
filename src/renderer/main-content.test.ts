import { describe, expect, it } from 'vitest';
import type { AppModel } from './app-model';
import { shouldShowLoading } from './main-content';

function model(state: {
  isLoading: boolean;
  isLoaded: boolean;
  taskCount: number;
}): Pick<AppModel, 'state' | 'clock'> {
  return {
    state: {
      isLoading: state.isLoading,
      isLoaded: state.isLoaded,
      tasks: Array.from({ length: state.taskCount }, () => ({})),
    },
    clock: { isReady: true },
  } as unknown as Pick<AppModel, 'state' | 'clock'>;
}

describe('full-screen loading state', () => {
  it('shows only until the first data has arrived', () => {
    expect(
      shouldShowLoading(
        model({ isLoading: true, isLoaded: false, taskCount: 0 }),
      ),
    ).toBe(true);
  });

  it('does not replace a screen on a later refresh, even when there are no tasks', () => {
    expect(
      shouldShowLoading(
        model({ isLoading: true, isLoaded: true, taskCount: 0 }),
      ),
    ).toBe(false);
  });
});
