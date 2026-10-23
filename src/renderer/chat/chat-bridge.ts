import type { HistoryState } from '../use-history';
import type { PersistedState } from '../use-persisted-tasks';

/** What the chat needs from the rest of the app once the AI changed data. */
export function chatBridge(
  state: Pick<PersistedState, 'refresh'>,
  history: Pick<HistoryState, 'refresh' | 'undo'>,
): {
  readonly onChatApplied: () => Promise<void>;
  readonly onChatUndo: HistoryState['undo'];
} {
  return {
    onChatApplied: async () => {
      await state.refresh();
      await history.refresh();
    },
    onChatUndo: async () => {
      await history.refresh();
      return history.undo();
    },
  };
}
