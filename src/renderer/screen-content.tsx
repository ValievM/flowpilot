import React from 'react';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from '../domain';
import { TaskSummary } from './components/task-summary';
import { BoardScreen } from './screens/board-screen';
import { NowScreen } from './screens/now-screen';
import { SettingsScreen } from './screens/settings-screen';
import { TodayScreen } from './screens/today-screen';
import { taskSummaryData } from './task-summary-data';
import type { MotionChoice } from './use-reduced-motion';
import type { ThemeChoice } from './theme/use-theme';
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
  readonly onViewChange: (view: View) => void;
  readonly onStart: (task: Task) => void;
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
        onStart={props.onStart}
      />
    );
  if (props.view === 'board')
    return <BoardScreen tasks={props.tasks.map(taskSummaryData)} />;
  if (props.view === 'all')
    return (
      <section className="simple-screen">
        <p className="eyebrow">ЛИЧНОЕ / ВСЕ ЗАДАЧИ</p>
        <h1>Все задачи</h1>
        <div className="all-task-list">
          {props.tasks.map((task) => (
            <TaskSummary key={task.id} task={taskSummaryData(task)} />
          ))}
        </div>
      </section>
    );
  return (
    <SettingsScreen
      theme={props.theme}
      onThemeChange={props.onThemeChange}
      workdays={props.workdays}
      onWorkdaysChange={props.onWorkdaysChange}
      motionChoice={props.motionChoice}
      onMotionChoiceChange={props.onMotionChoiceChange}
      loading={props.loading}
      saveError={props.saveError}
    />
  );
}
