import React from 'react';
import type { View } from '../types';

const labels: Record<View, string> = {
  today: 'Сегодня',
  now: 'Сейчас',
  board: 'Доска',
  all: 'Все задачи',
  rules: 'Правила',
  chat: 'Чат с AI',
  replan: 'Перестроить порядок',
  settings: 'Настройки',
};

interface TopBarProps {
  view: View;
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
  saved: boolean;
  error: string | undefined;
  undoDisabled: boolean;
  onAddTask: () => void;
  replan: { readonly running: boolean; readonly onRun: () => void };
  onUndo: () => void;
  onOpenHistory: () => void;
  addButtonRef: React.RefObject<HTMLButtonElement | null>;
  historyButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function TopBar({
  view,
  sidebarHidden,
  onToggleSidebar,
  saved,
  error,
  undoDisabled,
  onAddTask,
  replan,
  onUndo,
  onOpenHistory,
  addButtonRef,
  historyButtonRef,
}: TopBarProps): React.JSX.Element {
  const status = error
    ? 'Ошибка сохранения'
    : saved
      ? 'Сохранено'
      : 'Сохраняем…';
  return (
    <header className="topbar drag-region">
      <div className="breadcrumbs" aria-label="Хлебные крошки">
        <button
          className="button icon-button no-drag sidebar-toggle"
          type="button"
          aria-label={
            sidebarHidden ? 'Показать боковую панель' : 'Скрыть боковую панель'
          }
          aria-expanded={!sidebarHidden}
          onClick={onToggleSidebar}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v14H4zM9 5v14" />
          </svg>
        </button>
        <span className="crumb-root">Моё пространство</span>
        <span className="crumb-root" aria-hidden="true">
          /
        </span>
        <span aria-current="page">{labels[view]}</span>
      </div>
      <div className="top-actions">
        <span
          className={`saved-status${error ? ' has-error' : ''}`}
          role="status"
        >
          <span className="saved-dot" aria-hidden="true" />
          {status}
        </span>
        <button
          className="button no-drag"
          type="button"
          disabled={undoDisabled}
          onClick={onUndo}
        >
          Отменить
        </button>
        <button
          className="button no-drag"
          ref={historyButtonRef}
          type="button"
          onClick={onOpenHistory}
        >
          История
        </button>
        <button
          className="button no-drag"
          type="button"
          disabled={replan.running}
          onClick={replan.onRun}
        >
          Перестроить
        </button>
        <button
          className="button button-primary add-button no-drag"
          ref={addButtonRef}
          type="button"
          onClick={onAddTask}
        >
          <span className="add-icon" aria-hidden="true">
            +
          </span>{' '}
          Задача
        </button>
      </div>
    </header>
  );
}
