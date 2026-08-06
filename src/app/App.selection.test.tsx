import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Covers the Phase 3 selection-model change: `selection` (pieces/feature) is
// unified into one field on GalleryState, and `expandedPieceId` is derived
// from it rather than tracked separately. These tests exercise exactly the
// two guarantees that change is supposed to provide:
//   1. Selection changes must stay outside the undo fingerprint.
//   2. A piece row auto-collapses whenever selection moves away from it,
//      even via paths (feature selection, auto-place) that previously left
//      an explicitly-tracked expandedPieceId untouched.
describe('Gallery Designer selection model', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
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

  it('does not enable Undo when only the selected piece changes', async () => {
    // Seed two pieces directly: adding a piece through the UI is itself an
    // undoable action, which would confound the assertion below.
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        sections: [{ id: 'section-1', name: 'Section 1', widthIn: 96, heightIn: 84 }],
        pieces: [
          { id: 'piece-1', label: 'Piece 1', widthIn: 16, heightIn: 20 },
          { id: 'piece-2', label: 'Piece 2', widthIn: 16, heightIn: 20 },
        ],
        placements: [],
        selectedPieceIds: ['piece-2'],
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    const undo = screen.getByRole('button', { name: /Undo last change/i });
    expect(undo).toBeDisabled();

    const firstPieceRow = screen
      .getByText('Piece 1', { selector: '.row-name-readonly' })
      .closest('article');
    // Piece 2 starts selected/expanded; select piece 1 instead. A pure
    // selection change must not make Undo available.
    await user.click(firstPieceRow!);

    expect(screen.getByLabelText('Piece 1 label')).toBeInTheDocument();
    expect(undo).toBeDisabled();
  });

  it('collapses an expanded piece row when a feature is selected instead', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Piece 1 is selected (and so expanded) by default.
    const pieceRow = screen.getByLabelText('Piece 1 label').closest('article');
    expect(pieceRow).toHaveClass('expanded');

    const placementDrawerButton = screen.getByRole('button', { name: /Auto-placement options/i });
    await user.click(placementDrawerButton);
    const placementDrawer = screen.getByRole('dialog', { name: /Auto-placement settings/i });
    await user.selectOptions(
      within(placementDrawer).getByLabelText('Wall setup'),
      'full-wall-with-features',
    );
    await user.click(
      within(placementDrawer).getByRole('button', { name: /Add furniture or feature/i }),
    );

    // Selecting a feature is not a piece selection at all, so per the
    // deliberate, user-approved 3b decision it now collapses the
    // previously-expanded piece row (this UX change is intentional, not a
    // bug: a feature/section selection never leaves exactly one piece
    // selected, so no piece row stays expanded).
    expect(pieceRow).toHaveClass('collapsed');
  });

  it('collapses an expanded piece row after auto-placing pieces', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Place Piece 1 first, then add Piece 2 (left unplaced).
    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));

    // Re-select and expand Piece 1's row explicitly.
    const pieceRow = screen
      .getByText('Piece 1', { selector: '.row-name-readonly' })
      .closest('article');
    await user.click(pieceRow!);
    expect(pieceRow).toHaveClass('expanded');

    // Auto-place again: only Piece 2 is new, so selection moves to it. Under
    // the old, independently-tracked expandedPieceId, auto-place never
    // touched that state, so Piece 1's row would have stayed expanded even
    // though it is no longer selected. Deriving it fixes that mismatch.
    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    expect(pieceRow).toHaveClass('collapsed');
  });
});
