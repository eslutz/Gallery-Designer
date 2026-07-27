// Temporary DOM-equivalence tripwire for the App.tsx decomposition (Phases 1-2
// of the plan). Snapshots container.innerHTML for a few states so pure
// mechanical file moves (helpers -> src/lib/, components -> src/components/)
// can be verified byte-identical, which the 111 behavioral tests in
// App.test.tsx only approximate. Delete this file at the end of Phase 2.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App DOM contract (tripwire)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.style.colorScheme = '';
    document.body.classList.remove('suppress-text-selection');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['en-US'] });
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'en-US' });
    window.matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: query.includes('prefers-color-scheme: dark'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
  });

  it('matches the default-state DOM snapshot', () => {
    const { container } = render(<App />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches the DOM snapshot with the Advanced drawer open', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: /^Advanced$/i }));
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches the DOM snapshot with the wall zoomed in', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: /^Zoom in$/i }));
    await user.click(screen.getByRole('button', { name: /^Zoom in$/i }));
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('matches the DOM snapshot with the default piece auto-placed on the wall', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));
    expect(container.innerHTML).toMatchSnapshot();
  });
});
