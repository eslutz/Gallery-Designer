import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ArtPiece } from '../../types';
import { HookControls } from './HookControls';

const piece: ArtPiece = { id: 'piece-1', label: 'Sunset', widthIn: 16, heightIn: 20 };

describe('HookControls', () => {
  it('shows None selected and no offset fields when the piece has no hooks', () => {
    render(<HookControls piece={piece} unit="in" onUnitChange={vi.fn()} onChange={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Hooks for Sunset' })).toHaveValue('0');
    expect(screen.queryByLabelText(/hook down from top/)).toBeNull();
  });

  it('switches to a single hook and reports the default offsets', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<HookControls piece={piece} unit="in" onUnitChange={vi.fn()} onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Hooks for Sunset' }), '1');

    expect(onChange).toHaveBeenCalledWith({ count: 1, topOffsetIn: 2, leftOffsetIn: 8 });
  });

  it('renders offset fields for a two-hook piece, including a shared top offset', () => {
    const twoHookPiece: ArtPiece = {
      ...piece,
      hookSpec: {
        count: 2,
        topOffsetIn: 2,
        leftSideOffsetIn: 3,
        rightSideOffsetIn: 3,
      },
    };
    render(
      <HookControls piece={twoHookPiece} unit="in" onUnitChange={vi.fn()} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText('Sunset hooks down from top')).toHaveValue('2');
    expect(screen.getByLabelText('Sunset left hook from left side')).toBeInTheDocument();
    expect(screen.getByLabelText('Sunset right hook from right side')).toBeInTheDocument();
  });

  it('applies a shared top offset to both hooks when switching to two hooks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<HookControls piece={piece} unit="in" onUnitChange={vi.fn()} onChange={onChange} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Hooks for Sunset' }), '2');

    expect(onChange).toHaveBeenCalledWith({
      count: 2,
      topOffsetIn: 2,
      leftSideOffsetIn: 3,
      rightSideOffsetIn: 3,
    });
  });
});
