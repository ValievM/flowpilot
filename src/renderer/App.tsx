import React from 'react';
import type { ThemeChoice } from '../shared/contracts';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from '../domain';
import { QuickAddDialog } from './components/quick-add-dialog';
import { Sidebar } from './components/sidebar';
import { TopBar } from './components/top-bar';
import { ScreenContent } from './screen-content';
import type { ScreenProps } from './screen-content';
import { taskViews } from './task-views';
import { useCurrentTime } from './use-current-time';
import type { LocalClock } from './use-current-time';
import { useReducedMotion } from './use-reduced-motion';
import { usePersistedTasks } from './use-persisted-tasks';
import type { MotionChoice } from './use-reduced-motion';
import { useTheme } from './theme/use-theme';
import type { View } from './types';
import { addTask, startTask } from './task-commands';
import { useQuickAddShortcut } from './use-quick-add-shortcut';

function localDateLabel(date: TemporalTypes.PlainDate): string {
  return `Сегодня, ${date.toLocaleString('ru-RU', { day: 'numeric', month: 'long' })}`;
}

interface AppModel {
  readonly theme: ThemeChoice;
  readonly setTheme: (theme: ThemeChoice) => void;
  readonly motionChoice: MotionChoice;
  readonly setMotionChoice: (choice: MotionChoice) => void;
  readonly view: View;
  readonly setView: (view: View) => void;
  readonly quickAddOpen: boolean;
  readonly setQuickAddOpen: (open: boolean) => void;
  readonly addButtonRef: React.RefObject<HTMLButtonElement | null>;
  readonly state: ReturnType<typeof usePersistedTasks>;
  readonly views: ReturnType<typeof taskViews>;
  readonly clock: LocalClock;
  readonly cycleTheme: () => void;
  readonly startTask: (task: Task) => Promise<void>;
  readonly addTask: (title: string) => Promise<boolean>;
}

function useAppModel(initialTheme: ThemeChoice): AppModel {
  const [theme, setTheme] = useTheme(initialTheme);
  const [motionChoice, setMotionChoice] = useReducedMotion();
  const [view, setView] = React.useState<View>('today');
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const clock = useCurrentTime();
  const state = usePersistedTasks();
  const views = taskViews(state.tasks, clock);
  useQuickAddShortcut(quickAddOpen, setQuickAddOpen);
  const cycleTheme = (): void => {
    setTheme((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    );
  };
  return {
    theme,
    setTheme,
    motionChoice,
    setMotionChoice,
    view,
    setView,
    quickAddOpen,
    setQuickAddOpen,
    addButtonRef,
    state,
    views,
    clock,
    cycleTheme,
    startTask: (task) => startTask(state, task),
    addTask: (title) => addTask(state, title, views.today.toString()),
  };
}

function LoadingState(): React.JSX.Element {
  return (
    <section className="loading-state" role="status">
      <h1>Загружаем сохранённые задачи…</h1>
      <p>Ваши дела появятся здесь после чтения приложения.</p>
    </section>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  readonly error: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <section className="error-state" role="alert">
      <p>{error}</p>
      <button className="button" type="button" onClick={onRetry}>
        Повторить загрузку
      </button>
    </section>
  );
}

function shouldShowLoading(model: AppModel): boolean {
  const { state } = model;
  return (
    (!model.clock.isReady && !model.clock.error) ||
    (state.isLoading && state.tasks.length === 0)
  );
}
function MainContent({
  model,
  screenProps,
}: {
  readonly model: AppModel;
  readonly screenProps: ScreenProps;
}): React.JSX.Element {
  const { state, view, views } = model;
  if (shouldShowLoading(model)) return <LoadingState />;
  if (state.loadError && state.tasks.length === 0)
    return (
      <ErrorState
        error={state.loadError}
        onRetry={() => {
          void state.refresh();
        }}
      />
    );
  return (
    <>
      <ScreenContent
        {...screenProps}
        tasks={
          view === 'board' || view === 'all' ? views.all : views.todayTasks
        }
      />
      {model.clock.error && (
        <p className="load-error" role="alert">
          {model.clock.error}
          <button className="button" type="button" onClick={model.clock.retry}>
            Повторить получение времени
          </button>
        </p>
      )}
      {state.isLoading && (
        <p className="refresh-status" role="status">
          Обновляем данные…
        </p>
      )}
      {state.loadError && (
        <p className="load-error" role="alert">
          {state.loadError}
          <button
            className="button"
            type="button"
            onClick={() => void state.refresh()}
          >
            Повторить загрузку
          </button>
        </p>
      )}
      {state.commandError && (
        <p className="save-error" role="alert">
          {state.commandError}
        </p>
      )}
    </>
  );
}

function AppLayout({ model }: { readonly model: AppModel }): React.JSX.Element {
  const { state, view, views } = model;
  const screenProps: ScreenProps = {
    view,
    hasTasks: views.all.length > 0,
    hasUndatedTasks: views.all.some(
      (task) => task.day === undefined && task.status.kind !== 'done',
    ),
    tasks: views.todayTasks,
    today: views.today,
    todayLabel: localDateLabel(views.today),
    available: views.available,
    workdays: state.workdays,
    loading: state.isLoading,
    theme: model.theme,
    onThemeChange: model.setTheme,
    motionChoice: model.motionChoice,
    onMotionChoiceChange: model.setMotionChoice,
    onWorkdaysChange: (workdays) => state.updateWorkdays(workdays),
    saveError: state.settingsError,
    onViewChange: model.setView,
    onStart: (task) => void model.startTask(task),
  };
  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        availableCount={views.available.length}
        theme={model.theme}
        onViewChange={model.setView}
        onThemeCycle={model.cycleTheme}
      />
      <div className="workspace">
        <TopBar
          view={view}
          saved={state.isSaved}
          error={state.commandError ?? state.settingsError}
          onAddTask={() => {
            model.setQuickAddOpen(true);
          }}
          addButtonRef={model.addButtonRef}
        />
        <main className="main-content" aria-busy={state.isLoading}>
          <MainContent model={model} screenProps={screenProps} />
        </main>
      </div>
      <QuickAddDialog
        open={model.quickAddOpen}
        onClose={() => {
          model.setQuickAddOpen(false);
        }}
        onSubmit={model.addTask}
        addButtonRef={model.addButtonRef}
      />
    </div>
  );
}

export function App({
  initialTheme = 'system',
}: {
  readonly initialTheme?: ThemeChoice;
}): React.JSX.Element {
  return <AppLayout model={useAppModel(initialTheme)} />;
}
