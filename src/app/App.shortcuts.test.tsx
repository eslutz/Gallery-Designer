import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { setWelcomeSeen } from '../editor/onboarding/welcomeGuide';

// Each test here corresponds to one documented row in
// src/editor/interaction/keyboardShortcuts.ts's "Editing" group and the Delete/Backspace
// row in "Moving art" — this file exists specifically so a shortcut added to
// that registry with no matching handler (or vice versa) fails loudly.
describe('keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    // The welcome modal auto-focuses itself and blocks the canvas keydown
    // handler while open (App.tsx's `[role="dialog"]` bail) — seed it as
    // already seen so it doesn't compete with the shortcuts under test.
    setWelcomeSeen(true);
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

  it('opens the shortcuts legend on "?"', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();

    await user.keyboard('?');

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('does not open the legend while typing "?" into a text field', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Piece 1 label'));
    await user.type(screen.getByLabelText('Piece 1 label'), '?');

    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });

  it('undoes the last change on Cmd/Ctrl+Z', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Duplicate Piece 1/i }));
    expect(screen.getByDisplayValue('Piece 1 copy')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(screen.getByRole('status')).toHaveTextContent(/Restored the previous change/i);
    expect(screen.queryByDisplayValue('Piece 1 copy')).not.toBeInTheDocument();
  });

  it('does not undo on Cmd/Ctrl+Shift+Z (no redo exists)', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Duplicate Piece 1/i }));

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });

    expect(screen.getByDisplayValue('Piece 1 copy')).toBeInTheDocument();
  });

  it('returns the selected placed piece to the staging tray on Delete', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));
    const placedPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    placedPiece.focus();

    fireEvent.keyDown(placedPiece, { key: 'Delete' });

    expect(screen.getByRole('status')).toHaveTextContent(/Returned Piece 1 to the staging tray/i);
    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
  });

  it('returns the selected placed piece to the staging tray on Backspace', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));
    const placedPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    placedPiece.focus();

    fireEvent.keyDown(placedPiece, { key: 'Backspace' });

    expect(screen.getByRole('status')).toHaveTextContent(/Returned Piece 1 to the staging tray/i);
    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
  });

  it('does nothing on Delete while typing in a text field', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));
    const nameField = screen.getByLabelText('Piece 1 label');
    nameField.focus();

    fireEvent.keyDown(nameField, { key: 'Delete' });

    expect(
      screen.queryByRole('button', { name: /Drag Piece 1 from staging/i }),
    ).not.toBeInTheDocument();
  });

  it('does nothing on Delete when nothing placed is selected', async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(screen.queryByRole('status')).not.toHaveTextContent(/Returned/i);
  });
});
