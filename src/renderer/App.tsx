import React from 'react';
import type { ThemeChoice } from '../shared/contracts';
import type { Temporal as TemporalTypes } from 'temporal-polyfill';
import type { Task } from '../domain';
import { TaskCard } from './components/task-card';
import { QuickAddDialog } from './components/quick-add-dialog';
import { Sidebar } from './components/sidebar';
import { TopBar } from './components/top-bar';
import { useSidebarVisibility } from './use-sidebar-visibility';
import { ScreenContent, type ScreenProps } from './screen-content';
import { taskViews } from './task-views';
import { useCurrentTime, type LocalClock } from './use-current-time';
import { useReducedMotion, type MotionChoice } from './use-reduced-motion';
import { usePersistedTasks } from './use-persisted-tasks';
import { useTheme } from './theme/use-theme';
import type { View } from './types';
import { chatBridge } from './chat/chat-bridge';
import { addTask, startTask } from './task-commands';
import { useQuickAddShortcut } from './use-quick-add-shortcut';
import { HistoryPanel } from './components/history-panel';
import { useHistory, type HistoryState } from './use-history';
import { RepeatSchedule } from './screens/repeat-schedule';
import { createSeries } from './create-series';

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
  readonly historyButtonRef: React.RefObject<HTMLButtonElement | null>;
  readonly history: HistoryState;
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

function useAppModel(initialTheme: ThemeChoice): AppModel {
  const [theme, setTheme] = useTheme(initialTheme);
  const [motionChoice, setMotionChoice] = useReducedMotion();
  const [view, setView] = React.useState<View>('today');
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [taskCardId, setTaskCardId] = React.useState<string>();
  const taskCardTrigger = React.useRef<HTMLElement | null>(null);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const historyButtonRef = React.useRef<HTMLButtonElement>(null);
  const clock = useCurrentTime();
  const state = usePersistedTasks();
  const history = useHistory(() => state.refresh());
  const views = taskViews(state.tasks, clock);
  useQuickAddShortcut(quickAddOpen, setQuickAddOpen);
  const cycleTheme = (): void => {
    setTheme((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    );
  };
  const openTask = (id: string, trigger: HTMLElement): void => {
    taskCardTrigger.current = trigger;
    setTaskCardId(id);
  };
  const closeTask = (): void => {
    setTaskCardId(undefined);
    requestAnimationFrame(() => taskCardTrigger.current?.focus());
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
    historyButtonRef,
    history,
    state,
    views,
    clock,
    cycleTheme,
    startTask: (task) => startTask(state, task),
    addTask: (title) => addTask(state, title, views.today.toString()),
    taskCardId,
    openTask,
    closeTask,
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
  const { state } = model;
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
      <ScreenContent {...screenProps} />
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
  const sidebar = useSidebarVisibility();
  const { state, view, views } = model;
  const taskCard = state.tasks.find((task) => task.id === model.taskCardId);
  const screenProps: ScreenProps = {
    view,
    hasTasks: views.all.length > 0,
    hasUndatedTasks: views.all.some(
      (task) => task.day === undefined && task.status.kind !== 'done',
    ),
    tasks: view === 'board' || view === 'all' ? views.all : views.todayTasks,
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
    backup: window.flowpilot.backup,
    onSnapshotRefresh: () => state.refresh(),
    onStart: (task) => void model.startTask(task),
    onOpenTask: model.openTask,
    allTasks: views.all,
    ...chatBridge(state, model.history),
  };
  return (
    <div className={`app-shell${sidebar.hidden ? ' is-sidebar-hidden' : ''}`}>
      <Sidebar
        hidden={sidebar.hidden}
        view={view}
        availableCount={views.available.length}
        theme={model.theme}
        onViewChange={model.setView}
        onThemeCycle={model.cycleTheme}
      />
      <div className="workspace">
        <TopBar
          view={view}
          sidebarHidden={sidebar.hidden}
          onToggleSidebar={sidebar.toggle}
          saved={state.isSaved}
          undoDisabled={
            !model.history.entries.some(
              (entry) => entry.source !== 'undo' && entry.source !== 'restore',
            )
          }
          error={state.commandError ?? state.settingsError}
          onAddTask={() => {
            model.setQuickAddOpen(true);
          }}
          onUndo={() => void model.history.undo()}
          onOpenHistory={() => {
            model.history.setOpen(true);
            void model.history.refresh();
          }}
          addButtonRef={model.addButtonRef}
          historyButtonRef={model.historyButtonRef}
        />
        <main
          className={`main-content${view === 'now' ? ' is-focus' : ''}`}
          aria-busy={state.isLoading}
        >
          <MainContent model={model} screenProps={screenProps} />
          <RepeatSchedule state={state} clock={model.clock} view={view} />
        </main>
        {model.history.notice && (
          <p className="history-notice" role="status">
            {model.history.notice}
          </p>
        )}
      </div>
      {taskCard && (
        <TaskCard
          task={taskCard}
          state={state}
          today={views.today}
          workdays={state.workdays}
          onClose={model.closeTask}
        />
      )}
      <QuickAddDialog
        open={model.quickAddOpen}
        onClose={() => {
          model.setQuickAddOpen(false);
        }}
        onSubmit={model.addTask}
        today={views.today}
        onCreateSeries={(series) => createSeries(state, series)}
        addButtonRef={model.addButtonRef}
      />
      <HistoryPanel
        open={model.history.open}
        entries={model.history.entries}
        tasks={state.tasks}
        loading={model.history.loading}
        error={model.history.error}
        onClose={() => {
          model.history.setOpen(false);
        }}
        onUndo={(id) => model.history.undo(id)}
        triggerRef={model.historyButtonRef}
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
