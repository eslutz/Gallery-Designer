import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { LIBRARY_KEY, designKey, type DesignLibrary } from './lib/designLibrary';

function readLibrary(): DesignLibrary {
  return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '{}') as DesignLibrary;
}

// The switcher trigger's accessible name is the active design's name, which
// can also appear inside unrelated elements (e.g. a toast's dismiss button
// reads "Dismiss notification: Opened \"Design 2\"."). Scope the query to the
// trigger's own class rather than matching by name.
function switcherTrigger(): HTMLElement {
  const trigger = document.querySelector('.design-switcher-trigger');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error('Design switcher trigger not found');
  }
  return trigger;
}

describe('multi-design switching', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
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

  it("creates a second design, and autosave writes only the active design's key", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(switcherTrigger());
    await user.click(screen.getByRole('menuitem', { name: 'New design' }));

    await waitFor(() => {
      expect(switcherTrigger()).toHaveTextContent('Design 2');
    });

    const library = readLibrary();
    expect(library.designs).toHaveLength(2);
    expect(library.activeId).toBe(library.designs[1].id);

    const activeDesignRaw = localStorage.getItem(designKey(library.activeId));
    expect(activeDesignRaw).not.toBeNull();

    // Edit the new (empty) design and confirm the write lands only under its
    // own key, not the design we switched away from.
    await user.click(screen.getByRole('button', { name: /Add wall section/i }));

    // A new design is seeded from the default state, which already ships
    // with one wall section — adding another brings it to two.
    await waitFor(() => {
      const updated = JSON.parse(localStorage.getItem(designKey(library.activeId)) ?? '{}');
      expect(updated.sections).toHaveLength(2);
    });

    const otherDesignId = library.designs[0].id;
    const otherDesignRaw = JSON.parse(localStorage.getItem(designKey(otherDesignId)) ?? '{}');
    expect(otherDesignRaw.sections).toHaveLength(1);
  });

  it('clears undo history when switching designs, and switching back restores the persisted edit', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Make an undoable edit in the first design ("My design").
    await user.click(screen.getByRole('button', { name: /Duplicate Piece 1/i }));
    expect(screen.getByDisplayValue('Piece 1 copy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo last change' })).toBeEnabled();

    // Switch to a brand-new design.
    await user.click(switcherTrigger());
    await user.click(screen.getByRole('menuitem', { name: 'New design' }));

    await waitFor(() => {
      expect(switcherTrigger()).toHaveTextContent('Design 2');
    });

    // The undo snapshot from the previous design must not follow us here.
    expect(screen.getByRole('button', { name: 'Undo last change' })).toBeDisabled();
    expect(screen.queryByDisplayValue('Piece 1 copy')).not.toBeInTheDocument();

    // Switch back — the edit we made before leaving must have been flushed
    // to storage and reloaded, but undo must still be empty (a design switch
    // is a context change, not an undoable step).
    await user.click(switcherTrigger());
    await user.click(screen.getByRole('menuitemradio', { name: 'My design' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Piece 1 copy')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Undo last change' })).toBeDisabled();
  });

  it('lists both designs in the switcher menu with the active one checked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(switcherTrigger());
    await user.click(screen.getByRole('menuitem', { name: 'New design' }));

    await waitFor(() => {
      expect(switcherTrigger()).toHaveTextContent('Design 2');
    });

    await user.click(switcherTrigger());
    const menu = screen.getByRole('menu', { name: 'Designs' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Design 2' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(menu).getByRole('menuitemradio', { name: 'My design' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

describe('manage designs dialog', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
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

  it('opens from the switcher, renames the active design, and reflects the new name in the trigger', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(switcherTrigger());
    await user.click(screen.getByRole('menuitem', { name: /Manage designs/i }));

    const dialog = screen.getByRole('dialog', { name: 'Manage designs' });
    await user.click(within(dialog).getByRole('button', { name: 'Rename My design' }));
    const input = within(dialog).getByLabelText('Design name');
    await user.clear(input);
    await user.type(input, 'Living room wall');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(dialog).getByText('Living room wall')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close Manage designs' }));
    expect(switcherTrigger()).toHaveTextContent('Living room wall');
  });

  it('deletes the active design and switches into the design it was replaced by', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(switcherTrigger());
    await user.click(screen.getByRole('menuitem', { name: 'New design' }));
    await waitFor(() => {
      expect(switcherTrigger()).toHaveTextContent('Design 2');
    });

    await user.click(switcherTrigger());
    await user.click(screen.getByRole('menuitem', { name: /Manage designs/i }));

    const dialog = screen.getByRole('dialog', { name: 'Manage designs' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete Design 2' }));
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    // Deleting the active design must fall back to a remaining one, and undo
    // must not carry the deleted design's history along with it.
    await waitFor(() => {
      expect(switcherTrigger()).toHaveTextContent('My design');
    });
    expect(screen.getByRole('button', { name: 'Undo last change' })).toBeDisabled();
  });
});
