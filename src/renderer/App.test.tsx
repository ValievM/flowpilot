import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('starter interface', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('shows FlowPilot and can switch between themes', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'FlowPilot' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Переключить тему' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
