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
  onAddTask: () => void;
  addButtonRef: React.RefObject<HTMLButtonElement | null>;
}

export function TopBar({
  view,
  onAddTask,
  addButtonRef,
}: TopBarProps): React.JSX.Element {
  return (
    <header className="topbar">
      <div className="breadcrumbs" aria-label="Хлебные крошки">
        <span>Моё пространство</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{labels[view]}</span>
      </div>
      <div className="top-actions">
        <span className="saved-status">
          <span className="saved-dot" aria-hidden="true" />
          Сохранено
        </span>
        <button
          className="button button-primary add-button"
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
