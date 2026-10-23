import type React from 'react';
import type { Task } from '../domain';
import type { ThemeChoice } from '../shared/contracts';
import type { useAppAi } from './chat/chat-bridge';
import type { taskViews } from './task-views';
import type { usePersistedTasks } from './use-persisted-tasks';
import type { LocalClock } from './use-current-time';
import type { HistoryState } from './use-history';
import type { MotionChoice } from './use-reduced-motion';
import type { View } from './types';

export interface AppModel {
  readonly theme: ThemeChoice;
  readonly setTheme: (theme: ThemeChoice) => void;
  readonly motionChoice: MotionChoice;
  readonly setMotionChoice: (choice: MotionChoice) => void;
  readonly view: View;
  readonly setView: (view: View) => void;
  readonly quickAddOpen: boolean;
  readonly setQuickAddOpen: (open: boolean) => void;
  readonly addButtonRef: React.RefObject<HTMLButtonElement | null>;
  readonly historyButtonRef: React.RefObject<HTMLButtonElement | null>;
  readonly history: HistoryState;
  readonly ai: ReturnType<typeof useAppAi>;
  readonly state: ReturnType<typeof usePersistedTasks>;
  readonly views: ReturnType<typeof taskViews>;
  readonly clock: LocalClock;
  readonly cycleTheme: () => void;
  readonly startTask: (task: Task) => Promise<void>;
  readonly addTask: (title: string) => Promise<boolean>;
  readonly taskCardId: string | undefined;
  readonly openTask: (taskId: string, trigger: HTMLElement) => void;
  readonly closeTask: () => void;
}
