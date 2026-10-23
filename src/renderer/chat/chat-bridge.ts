import type { View } from '../types';
import type { HistoryState } from '../use-history';
import type { PersistedState } from '../use-persisted-tasks';
import { useReplan, type ReplanModel } from '../replan/use-replan';
import { useChat, type ChatModel } from './use-chat';

export interface AppAi {
  readonly chat: ChatModel;
  readonly replan: ReplanModel;
  /** The top-bar button: show the replan screen and ask the AI, once. */
  readonly replanButton: {
    readonly running: boolean;
    readonly onRun: () => void;
  };
}

/**
 * AI conversations live above the screens: the main area is replaced by a
 * loading state while data refreshes, and that must not wipe them.
 */
export function useAppAi(
  state: Pick<PersistedState, 'refresh' | 'revision'>,
  history: Pick<HistoryState, 'refresh' | 'undo'>,
  setView: (view: View) => void,
): AppAi {
  const deps = {
    onApplied: async () => {
      await state.refresh();
      await history.refresh();
    },
    undo: async () => {
      await history.refresh();
      return history.undo();
    },
  };
  const chat = useChat(deps);
  const replan = useReplan({ ...deps, revision: state.revision });
  return {
    chat,
    replan,
    replanButton: {
      running: replan.state.phase === 'running',
      onRun: () => {
        setView('replan');
        replan.run();
      },
    },
  };
}
