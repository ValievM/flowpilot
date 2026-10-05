import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

function mockSystemTheme(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

if (Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal') === undefined) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      value(this: HTMLDialogElement): void {
        this.setAttribute('open', '');
      },
    },
    close: {
      value(this: HTMLDialogElement): void {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    },
  });
}

describe('app shell', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('follows the system theme by default and persists a manual choice', () => {
    mockSystemTheme(true);
    render(<App />);
    expect(window.localStorage.getItem('flowpilot-theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
    const themeChoice = screen.getByRole('combobox', { name: 'Тема верхней панели' });
    fireEvent.change(themeChoice, { target: { value: 'light' } });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('flowpilot-theme')).toBe('light');
  });

  it('provides keyboard-focusable navigation and accessible icon buttons', () => {
    mockSystemTheme(false);
    render(<App />);
    const navigation = screen.getByRole('navigation', { name: 'Представления' });
    expect(within(navigation).getAllByRole('button').every((button) => button.tabIndex === 0)).toBe(true);
    expect(within(navigation).getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page');
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    expect(screen.getByLabelText('Что нужно сделать?')).toHaveFocus();
  });

  it('shows fixture tasks, an explanatory risk, and the next-step panel', () => {
    mockSystemTheme(false);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Очередь на сегодня' })).toBeVisible();
    expect(screen.getByText('Курсовая: собрать рабочий прототип')).toBeVisible();
    expect(screen.getByText(/следующий шаг/i)).toBeVisible();
    expect(screen.getAllByText(/до срока 5 рабочих дней, оценка остатка — 5/i)).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Собрать поиск и карточку книги' })).toBeVisible();
  });

  it('changes view with the keyboard-focusable navigation', () => {
    mockSystemTheme(false);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Все задачи' }));
    expect(screen.getByRole('heading', { name: 'Все задачи' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Представления' })).toContainElement(screen.getByRole('button', { name: 'Все задачи' }));
  });

  it('adds a task from the quick-add dialog', () => {
    mockSystemTheme(false);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Задача' }));
    fireEvent.change(screen.getByLabelText('Что нужно сделать?'), { target: { value: 'Подготовить заметки' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить задачу' }));
    expect(screen.getByText('Подготовить заметки')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('marks the next task as in progress when started', () => {
    mockSystemTheme(false);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Начать задачу' }));
    const coursework = screen.getByRole('heading', { name: 'Курсовая: собрать рабочий прототип' }).closest('li');
    if (!coursework) throw new Error('Coursework task is missing from the queue');
    expect(within(coursework).getByText('В работе')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Собрать поиск и карточку книги' })).toBeVisible();
  });

});
