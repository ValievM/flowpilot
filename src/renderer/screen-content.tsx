import React from 'react';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from '../domain';
import { AllTasksScreen } from './screens/all-tasks-screen';
import { BoardScreen } from './screens/board-screen';
import { NowScreen } from './screens/now-screen';
import { SettingsScreen } from './screens/settings-screen';
import { TodayScreen } from './screens/today-screen';
import type { MotionChoice } from './use-reduced-motion';
import type {
  FlowPilotApi,
  IpcSnapshot,
  ThemeChoice,
} from '../shared/contracts';
import type { View } from './types';
export interface ScreenProps {
  readonly view: View;
  readonly tasks: readonly Task[];
  readonly hasTasks: boolean;
  readonly hasUndatedTasks: boolean;
  readonly today: TemporalTypes.PlainDate;
  readonly todayLabel: string;
  readonly available: readonly Task[];
  readonly workdays: ReadonlySet<number>;
  readonly loading: boolean;
  readonly theme: ThemeChoice;
  readonly onThemeChange: (theme: ThemeChoice) => void;
  readonly motionChoice: MotionChoice;
  readonly onMotionChoiceChange: (choice: MotionChoice) => void;
  readonly onWorkdaysChange: (
    workdays: ReadonlySet<number>,
  ) => Promise<boolean>;
  readonly saveError: string | undefined;
  readonly backup: Pick<FlowPilotApi['backup'], 'verify' | 'restore'>;
  readonly onSnapshotRefresh: () => Promise<IpcSnapshot | undefined>;
  readonly onViewChange: (view: View) => void;
  readonly onStart: (task: Task) => void;
  readonly onOpenTask: (taskId: string, trigger: HTMLElement) => void;
}

export function ScreenContent(props: ScreenProps): React.JSX.Element {
  if (props.view === 'today')
    return (
      <TodayScreen
        tasks={props.tasks}
        hasTasks={props.hasTasks}
        hasUndatedTasks={props.hasUndatedTasks}
        available={props.available}
        workdays={props.workdays}
        today={props.today}
        todayLabel={props.todayLabel}
        onViewChange={props.onViewChange}
        onOpenTask={props.onOpenTask}
        onStart={props.onStart}
      />
    );

  if (props.view === 'now')
    return (
      <NowScreen
        task={props.available[0]}
        today={props.today}
        hasTasks={props.hasTasks}
        hasUndatedTasks={props.hasUndatedTasks}
        workdays={props.workdays}
        isLoading={props.loading}
        onOpenTask={props.onOpenTask}
        onStart={props.onStart}
      />
    );
  if (props.view === 'board')
    return <BoardScreen today={props.today} onOpenTask={props.onOpenTask} />;
  if (props.view === 'all')
    return (
      <AllTasksScreen
        tasks={props.tasks}
        today={props.today}
        workdays={props.workdays}
        onOpenTask={props.onOpenTask}
      />
    );
  return (
    <SettingsScreen
      theme={props.theme}
      onThemeChange={props.onThemeChange}
      motionChoice={props.motionChoice}
      onMotionChoiceChange={props.onMotionChoiceChange}
      workdays={props.workdays}
      onWorkdaysChange={props.onWorkdaysChange}
      loading={props.loading}
      saveError={props.saveError}
      backup={props.backup}
      onSnapshotRefresh={props.onSnapshotRefresh}
    />
  );
}
