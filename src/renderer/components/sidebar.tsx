import React from 'react';
import { Icon } from './icon';
import type { ThemeChoice } from '../../shared/contracts';
import type { View } from '../types';

const views: readonly { id: View; label: string; icon: string }[] = [
  {
    id: 'today',
    label: 'Сегодня',
    icon: 'M12 3v2m0 14v2M3 12h2m14 0h2m-14-7 1.5 1.5m11 11L21 21M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  },
  { id: 'now', label: 'Сейчас', icon: 'm9 5 10 7-10 7Z' },
  {
    id: 'board',
    label: 'Доска',
    icon: 'm3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4',
  },
  {
    id: 'all',
    label: 'Все задачи',
    icon: 'M5 6h14M5 12h14M5 18h14M2 6h.01M2 12h.01M2 18h.01',
  },
  {
    id: 'chat',
    label: 'Чат с AI',
    icon: 'M21 11a8 8 0 0 1-8 8H7l-4 3V11a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8ZM8 9h8M8 13h5',
  },
];

interface SidebarProps {
  hidden: boolean;
  view: View;
  availableCount: number;
  theme: ThemeChoice;
  onViewChange: (view: View) => void;
  onThemeCycle: () => void;
}

export function Sidebar({
  hidden,
  view,
  availableCount,
  theme,
  onViewChange,
  onThemeCycle,
}: SidebarProps): React.JSX.Element {
  const themeLabel =
    theme === 'system'
      ? 'как в системе'
      : theme === 'light'
        ? 'светлая'
        : 'тёмная';
  return (
    <aside className="sidebar" aria-label="Основная панель" inert={hidden}>
      <div className="sidebar-titlebar-drag" aria-hidden="true" />
      <a
        className="brand"
        href="#today"
        onClick={(event) => {
          event.preventDefault();
          onViewChange('today');
        }}
        aria-label="FlowPilot — Сегодня"
      >
        <span className="brand-mark" aria-hidden="true">
          <Icon path="M5 19V9a4 4 0 0 1 4-4h10M5 12h10m0-4 4 4-4 4" />
        </span>
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
              onViewChange(item.id);
            }}
          >
            <Icon path={item.icon} />
            <span className="nav-label">{item.label}</span>
            {item.id === 'today' && (
              <span className="nav-count">{availableCount}</span>
            )}
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
            onViewChange('settings');
          }}
        >
          <Icon path="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64" />
          <span className="nav-label">Настройки</span>
        </button>
        <button
          className="nav-item theme-toggle"
          type="button"
          aria-label={`Тема: ${themeLabel}`}
          onClick={onThemeCycle}
        >
          <Icon path="M20 15A8 8 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z" />
          <span className="nav-label">Тема</span>
        </button>
      </div>
    </aside>
  );
}
