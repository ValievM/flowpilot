import React from 'react';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from '../domain';
import { AllTasksScreen } from './screens/all-tasks-screen';
import { ChatScreen } from './screens/chat-screen';
import { BoardScreen } from './screens/board-screen';
import { NowScreen } from './screens/now-screen';
import { SettingsScreen } from './screens/settings-screen';
import { TodayScreen } from './screens/today-screen';
import type { MotionChoice } from './use-reduced-motion';
import type {
  CommandsApplyRequest,
  IpcSnapshot,
  ThemeChoice,
} from '../shared/contracts';
import type { FlowPilotApi } from '../shared/flowpilot-api';
import type { View } from './types';
import type { AppAi } from './chat/chat-bridge';
import { ReplanScreen } from './screens/replan-screen';
import { RulesScreen } from './screens/rules-screen';
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
  readonly backup: Pick<
    FlowPilotApi['backup'],
    'export' | 'verify' | 'restore'
  >;
  readonly onSnapshotRefresh: () => Promise<IpcSnapshot | undefined>;
  readonly onStart: (task: Task) => void;
  readonly onOpenTask: (taskId: string, trigger: HTMLElement) => void;
  readonly allTasks: readonly Task[];
  readonly ai: AppAi;
  readonly onApply: (
    commands: CommandsApplyRequest['commands'],
  ) => Promise<boolean>;
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
        onOpenTask={props.onOpenTask}
        onStart={props.onStart}
      />
    );

  if (props.view === 'now')
    return (
      <NowScreen
        task={props.available[0]}
        allTasks={props.allTasks}
        today={props.today}
        hasTasks={props.hasTasks}
        hasUndatedTasks={props.hasUndatedTasks}
        workdays={props.workdays}
        isLoading={props.loading}
        onOpenTask={props.onOpenTask}
        onStart={props.onStart}
      />
    );
  if (props.view === 'chat')
    return (
      <ChatScreen
        tasks={props.allTasks}
        chat={props.ai.chat}
        onStart={props.onStart}
      />
    );
  if (props.view === 'rules') return <RulesScreen />;
  if (props.view === 'replan')
    return (
      <ReplanScreen
        replan={props.ai.replan}
        tasks={props.allTasks}
        mode={props.ai.chat.mode}
        loadMode={props.ai.chat.loadMode}
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
      tasks={props.allTasks}
      onApply={props.onApply}
    />
  );
}
