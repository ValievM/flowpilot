import React from 'react';
import type { View } from '../types';

const labels: Record<View, string> = {
  today: 'Сегодня',
  now: 'Сейчас',
  board: 'Доска',
  all: 'Все задачи',
  settings: 'Настройки',
};

interface TopBarProps {
  view: View;
  saved: boolean;
  error: string | undefined;
  undoDisabled: boolean;
  onAddTask: () => void;
  onUndo: () => void;
  onOpenHistory: () => void;
  addButtonRef: React.RefObject<HTMLButtonElement | null>;
  historyButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function TopBar({
  view,
  saved,
  error,
  undoDisabled,
  onAddTask,
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
        <span>Моё пространство</span>
        <span aria-hidden="true">/</span>
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
