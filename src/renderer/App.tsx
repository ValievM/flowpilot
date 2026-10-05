import React from 'react';
import { todayTasks, type TodayTask } from './fixtures/today';

type ThemeChoice = 'system' | 'light' | 'dark';
type View = 'today' | 'now' | 'board' | 'all' | 'settings';
type TaskState = TodayTask['state'];

const themeStorageKey = 'flowpilot-theme';
const views: { id: View; label: string; icon: string }[] = [
  { id: 'today', label: 'Сегодня', icon: 'M12 3v2m0 14v2M3 12h2m14 0h2m-14-7 1.5 1.5m11 11L21 21M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z' },
  { id: 'now', label: 'Сейчас', icon: 'm9 5 10 7-10 7Z' },
  { id: 'board', label: 'Доска', icon: 'm3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4' },
  { id: 'all', label: 'Все задачи', icon: 'M5 6h14M5 12h14M5 18h14M2 6h.01M2 12h.01M2 18h.01' },
];

function Icon({ path }: { path: string }): React.JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d={path} /></svg>;
}

function initialTheme(): ThemeChoice {
  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function App(): React.JSX.Element {
  const [theme, setTheme] = React.useState<ThemeChoice>(initialTheme);
  const [view, setView] = React.useState<View>('today');
  const [tasks, setTasks] = React.useState<TodayTask[]>(todayTasks);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const taskSequence = React.useRef(0);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (): void => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    applyTheme();
    media.addEventListener('change', applyTheme);
    if (theme === 'system') {
      window.localStorage.removeItem(themeStorageKey);
    } else {
      window.localStorage.setItem(themeStorageKey, theme);
    }
    return () => {
      media.removeEventListener('change', applyTheme);
    };
  }, [theme]);

  React.useEffect(() => {
    if (quickAddOpen) {
      dialogRef.current?.showModal();
      dialogRef.current?.querySelector('input')?.focus();
    } else if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [quickAddOpen]);

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
    document.documentElement.toggleAttribute('data-reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const availableTasks = tasks.filter((task) => task.state !== 'done');
  const actionableTasks = availableTasks.filter((task) => task.state !== 'waiting');
  const nextTask = actionableTasks[0];
  const pageTitle = views.find((item) => item.id === view)?.label ?? 'Настройки';

  const selectView = (selected: View): void => {
    setView(selected);
  };

  const setThemeChoice = (choice: ThemeChoice): void => {
    setTheme(choice);
  };
  const cycleTheme = (): void => {
    setTheme((current) => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system');
  };

  const startTask = (id: string): void => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, state: 'doing' } : task));
  };

  const addTask = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    taskSequence.current += 1;
    setTasks((current) => [...current, {
      id: `task-${taskSequence.current.toString()}`,
      title: trimmedTitle,
      subject: 'Без категории',
      due: 'Без срока',
      estimate: 'Оценка не указана',
      state: 'todo',
    }]);
    setTitle('');
    setQuickAddOpen(false);
    addButtonRef.current?.focus();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Основная панель">
        <a className="brand" href="#today" onClick={(event) => {
          event.preventDefault();
          selectView('today');
        }} aria-label="FlowPilot — Сегодня">
          <span className="brand-mark" aria-hidden="true"><Icon path="M5 19V9a4 4 0 0 1 4-4h10M5 12h10m0-4 4 4-4 4" /></span>
          <span>FlowPilot</span>
        </a>
        <nav className="primary-nav" aria-label="Представления">
          {views.map((item) => (
            <button
              className={`nav-item${view === item.id ? ' is-active' : ''}`}
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => {
                selectView(item.id);
              }}
            >
              <Icon path={item.icon} />
              <span className="nav-label">{item.label}</span>
              {item.id === 'today' && <span className="nav-count">{availableTasks.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item${view === 'settings' ? ' is-active' : ''}`}
            type="button"
            aria-label="Настройки"
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => {
              selectView('settings');
            }}
          >
            <Icon path="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64" />
            <span className="nav-label">Настройки</span>
          </button>
          <button
            className="nav-item theme-toggle"
            type="button"
            aria-label="Переключить тему"
            onClick={() => {
              cycleTheme();
            }}
          >
            <Icon path="M20 15A8 8 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z" />
            <span className="nav-label">Тема</span>
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs" aria-label="Хлебные крошки">
            <span>Моё пространство</span><span aria-hidden="true">/</span><span aria-current="page">{pageTitle}</span>
          </div>
          <div className="top-actions">
            <span className="saved-status"><span className="saved-dot" aria-hidden="true" />Сохранено</span>
            <select
              className="top-theme-select"
              aria-label="Тема верхней панели"
              value={theme}
              onChange={(event) => {
                setThemeChoice(event.target.value as ThemeChoice);
              }}
            >
              <option value="system">Как в системе</option>
              <option value="light">Светлая</option>
              <option value="dark">Тёмная</option>
            </select>
            <button
              className="button button-primary add-button"
              ref={addButtonRef}
              type="button"
              onClick={() => {
                setQuickAddOpen(true);
              }}
            ><span className="add-icon" aria-hidden="true">+</span> Задача</button>
          </div>
        </header>

        <main className="main-content">
          {view === 'today' && <TodayScreen
            tasks={tasks}
            availableCount={availableTasks.length}
            nextTask={nextTask}
            onViewChange={selectView}
            onStart={startTask}
          />}
          {view === 'now' && <section className="simple-screen">
            <p className="eyebrow">СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</p><h1>Сейчас</h1>
            {nextTask ? <TaskSummary task={nextTask} /> : <p>Сейчас нет доступных задач.</p>}
          </section>}
          {view === 'board' && <BoardScreen tasks={tasks} />}
          {view === 'all' && <section className="simple-screen">
            <p className="eyebrow">ЛИЧНОЕ / ВСЕ ЗАДАЧИ</p><h1>Все задачи</h1>
            <div className="all-task-list">{tasks.map((task) => <TaskSummary key={task.id} task={task} />)}</div>
          </section>}
          {view === 'settings' && <SettingsScreen
            theme={theme}
            reduceMotion={reduceMotion}
            onThemeChange={setThemeChoice}
            onReduceMotionChange={setReduceMotion}
          />}
        </main>
      </div>

      <dialog
        className="quick-dialog"
        ref={dialogRef}
        aria-labelledby="quick-title"
        onClose={() => {
          setQuickAddOpen(false);
          addButtonRef.current?.focus();
        }}
      >
        <div className="dialog-heading">
          <h2 id="quick-title">Новая задача</h2>
          <button className="button icon-button" type="button" aria-label="Закрыть" onClick={() => {
            setQuickAddOpen(false);
          }}>×</button>
        </div>
        <form onSubmit={addTask}>
          <label htmlFor="new-task-title">Что нужно сделать?</label>
          <input
            id="new-task-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            placeholder="Например, подготовить вопросы к семинару"
            required
            autoComplete="off"
          />
          <p className="helper-text">Достаточно названия. Срок и подробности можно добавить позже.</p>
          <div className="dialog-actions">
            <button className="button" type="button" onClick={() => {
              setQuickAddOpen(false);
            }}>Отмена</button>
            <button className="button button-primary" type="submit">Добавить задачу</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function BoardScreen({ tasks }: { tasks: TodayTask[] }): React.JSX.Element {
  const columns: { state: TaskState; title: string }[] = [
    { state: 'todo', title: 'Сделать' },
    { state: 'doing', title: 'В работе' },
    { state: 'waiting', title: 'Ожидание' },
  ];
  return (
    <section className="simple-screen">
      <p className="eyebrow">ЛИЧНОЕ / ДОСКА</p><h1>Доска</h1>
      <div className="board-columns">
        {columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.state === column.state);
          return (
            <section className="board-column" key={column.state}>
              <h2 className="board-column-heading">{column.title} <span className="board-count">{columnTasks.length}</span></h2>
              {columnTasks.map((task) => <TaskSummary key={task.id} task={task} />)}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function SettingsScreen({ theme, reduceMotion, onThemeChange, onReduceMotionChange }: {
  theme: ThemeChoice;
  reduceMotion: boolean;
  onThemeChange: (theme: ThemeChoice) => void;
  onReduceMotionChange: (reduceMotion: boolean) => void;
}): React.JSX.Element {
  return (
    <section className="simple-screen settings-screen">
      <p className="eyebrow">ЛИЧНОЕ / НАСТРОЙКИ</p><h1>Настройки</h1>
      <section className="settings-card">
        <h2>Внешний вид</h2>
        <label htmlFor="settings-theme">Тема оформления</label>
        <select id="settings-theme" value={theme} onChange={(event) => {
          onThemeChange(event.target.value as ThemeChoice);
        }}>
          <option value="system">Как в системе</option>
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
        </select>
        <label className="motion-setting">
          <input type="checkbox" checked={reduceMotion} onChange={(event) => {
            onReduceMotionChange(event.target.checked);
          }} />
          Уменьшить движение
        </label>
      </section>
    </section>
  );
}

function TodayScreen({ tasks, availableCount, nextTask, onViewChange, onStart }: {
  tasks: TodayTask[];
  availableCount: number;
  nextTask: TodayTask | undefined;
  onViewChange: (view: View) => void;
  onStart: (id: string) => void;
}): React.JSX.Element {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ЛИЧНОЕ / СЕГОДНЯ</p>
          <h1>Сегодня, 5 октября</h1>
          <p className="page-subtitle">Начни с доступного шага. Остальное — в своём порядке.</p>
        </div>
        <div className="view-tabs" role="group" aria-label="Режим просмотра">
          <button type="button" aria-current="page" onClick={() => {
            onViewChange('today');
          }}>Сегодня</button>
          <button type="button" onClick={() => {
            onViewChange('board');
          }}>Доска</button>
          <button type="button" onClick={() => {
            onViewChange('now');
          }}>Сейчас</button>
        </div>
      </div>
      <div className="today-layout">
        <section className="queue" aria-labelledby="queue-heading">
          <div className="queue-heading"><h2 id="queue-heading">Очередь на сегодня</h2><span className="queue-count">{availableCount} ЗАДАЧ</span></div>
          <ol className="task-list">
            {tasks.map((task, index) => (
              <li className={`task-row${task.state === 'waiting' ? ' is-waiting' : ''}`} key={task.id}>
                <span className="task-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="task-copy">
                  <h3>{task.title}</h3>
                  <div className="task-meta">
                    <span>{task.subject}</span><span aria-hidden="true">·</span>
                    <span>{task.state === 'waiting' ? 'Ждёт ответа' : task.due}</span>
                  </div>
                  {task.risk && <p className="risk-label"><span className="risk-icon" aria-hidden="true">!</span>{task.risk}</p>}
                </div>
                <span className={`state-label state-${task.state}`}>
                  {task.state === 'doing' ? 'В работе' : task.state === 'waiting' ? 'Ожидание' : task.state === 'done' ? 'Готово' : 'Сделать'}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <aside className="next-step" aria-labelledby="next-heading">
          <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ</p>
          {nextTask ? <>
            <h2 id="next-heading">{nextTask.step ?? nextTask.title}</h2>
            <p className="next-description">{nextTask.id === 'coursework' ? 'Часть курсовой. Впереди около пяти рабочих дней работы — начать стоит сегодня.' : nextTask.estimate}</p>
            {nextTask.risk && <p className="risk-detail"><strong>Риск не успеть</strong><span>{nextTask.risk}</span></p>}
            <div className="next-meta"><span>{nextTask.subject}</span><span>{nextTask.due}</span></div>
            <button className="button button-primary start-button" type="button" onClick={() => {
              onStart(nextTask.id);
            }}>Начать задачу</button>
          </> : <>
            <h2 id="next-heading">На сегодня всё</h2>
            <p>Можно посмотреть будущие дела или добавить новое.</p>
          </>}
        </aside>
      </div>
    </>
  );
}

function TaskSummary({ task }: { task: TodayTask }): React.JSX.Element {
  return (
    <article className="task-summary">
      <p className="task-summary-meta">{task.subject} · {task.due}</p>
      <h2>{task.title}</h2>
      {task.risk && <p className="risk-label">{task.risk}</p>}
    </article>
  );
}
