import React from 'react';
import { todayTasks, type TodayTask } from './fixtures/today';
import { QuickAddDialog } from './components/quick-add-dialog';
import { Sidebar } from './components/sidebar';
import { TaskSummary } from './components/task-summary';
import { TopBar } from './components/top-bar';
import { BoardScreen } from './screens/board-screen';
import { SettingsScreen } from './screens/settings-screen';
import { TodayScreen } from './screens/today-screen';
import { useTheme } from './theme/use-theme';
import type { View } from './types';

export function App(): React.JSX.Element {
  const [theme, setTheme] = useTheme();
  const [view, setView] = React.useState<View>('today');
  const [tasks, setTasks] = React.useState<TodayTask[]>(todayTasks);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const taskSequence = React.useRef(0);
  const availableTasks = tasks.filter((task) => task.state !== 'done');
  const nextTask = availableTasks.find((task) => task.state !== 'waiting');

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickAddOpen(true);
      }
      if (event.key === 'Escape' && quickAddOpen) setQuickAddOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [quickAddOpen]);

  React.useEffect(() => {
    document.documentElement.toggleAttribute(
      'data-reduce-motion',
      reduceMotion,
    );
  }, [reduceMotion]);

  const cycleTheme = (): void => {
    setTheme((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    );
  };
  const startTask = (id: string): void => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, state: 'doing' } : task,
      ),
    );
  };
  const addTask = (title: string): void => {
    taskSequence.current += 1;
    setTasks((current) => [
      ...current,
      {
        id: `task-${taskSequence.current.toString()}`,
        title,
        subject: 'Без категории',
        due: 'Без срока',
        estimate: 'Оценка не указана',
        state: 'todo',
      },
    ]);
  };

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        availableCount={availableTasks.length}
        theme={theme}
        onViewChange={setView}
        onThemeCycle={cycleTheme}
      />
      <div className="workspace">
        <TopBar
          view={view}
          onAddTask={() => {
            setQuickAddOpen(true);
          }}
          addButtonRef={addButtonRef}
        />
        <main className="main-content">
          {view === 'today' && (
            <TodayScreen
              tasks={tasks}
              availableCount={availableTasks.length}
              nextTask={nextTask}
              onViewChange={setView}
              onStart={startTask}
            />
          )}
          {view === 'now' && (
            <section className="simple-screen">
              <p className="eyebrow">СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</p>
              <h1>Сейчас</h1>
              {nextTask ? (
                <TaskSummary task={nextTask} />
              ) : (
                <p>Сейчас нет доступных задач.</p>
              )}
            </section>
          )}
          {view === 'board' && <BoardScreen tasks={tasks} />}
          {view === 'all' && (
            <section className="simple-screen">
              <p className="eyebrow">ЛИЧНОЕ / ВСЕ ЗАДАЧИ</p>
              <h1>Все задачи</h1>
              <div className="all-task-list">
                {tasks.map((task) => (
                  <TaskSummary key={task.id} task={task} />
                ))}
              </div>
            </section>
          )}
          {view === 'settings' && (
            <SettingsScreen
              reduceMotion={reduceMotion}
              onReduceMotionChange={setReduceMotion}
            />
          )}
        </main>
      </div>
      <QuickAddDialog
        open={quickAddOpen}
        onClose={() => {
          setQuickAddOpen(false);
        }}
        onSubmit={addTask}
        addButtonRef={addButtonRef}
      />
    </div>
  );
}
