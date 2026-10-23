import type { HistoryState } from '../use-history';
import type { PersistedState } from '../use-persisted-tasks';
import { useChat, type ChatModel } from './use-chat';

/**
 * The conversation lives above the screens: the main area is replaced by a
 * loading state while data refreshes, and that must not wipe the chat.
 */
export function useAppChat(
  state: Pick<PersistedState, 'refresh'>,
  history: Pick<HistoryState, 'refresh' | 'undo'>,
): ChatModel {
  return useChat({
    onApplied: async () => {
      await state.refresh();
      await history.refresh();
    },
    undo: async () => {
      await history.refresh();
      return history.undo();
    },
  });
}
