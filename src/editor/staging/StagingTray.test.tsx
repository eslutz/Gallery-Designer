import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ArtPiece, Placement, WallFeature } from '../../types';
import { StagedItem, StagingTray } from './StagingTray';

const pieces: ArtPiece[] = [
  { id: 'piece-1', label: 'Sunset', widthIn: 16, heightIn: 20 },
  { id: 'piece-2', label: 'Ocean', widthIn: 10, heightIn: 10 },
];
const placements: Placement[] = [{ pieceId: 'piece-2', sectionId: 'section-1', xIn: 0, yIn: 0 }];
const features: WallFeature[] = [
  {
    id: 'feature-1',
    type: 'sofa',
    name: 'Sofa',
    xIn: 0,
    yIn: 0,
    widthIn: 72,
    heightIn: 34,
    placed: false,
  },
];

function renderTray(overrides: Partial<React.ComponentProps<typeof StagingTray>> = {}) {
  return render(
    <StagingTray
      pieces={pieces}
      placements={placements}
      features={features}
      selectedPieceId=""
      selectedFeatureId=""
      unit="in"
      onAutoPlace={vi.fn()}
      onShuffle={vi.fn()}
      onOpenPlacementSettings={vi.fn()}
      onSelect={vi.fn()}
      onFeatureSelect={vi.fn()}
      onPointerDown={vi.fn()}
      onFeaturePointerDown={vi.fn()}
      onPlacePiece={vi.fn()}
      onRemovePiece={vi.fn()}
      onRemoveFeature={vi.fn()}
      {...overrides}
    />,
  );
}

describe('StagingTray', () => {
  it('lists only unplaced pieces and unplaced features', () => {
    renderTray();

    expect(screen.getByText('Sunset')).toBeInTheDocument();
    expect(screen.queryByText('Ocean')).toBeNull();
    expect(screen.getByText('Sofa')).toBeInTheDocument();
  });

  it('shows the empty-tray message when nothing is staged', () => {
    renderTray({
      pieces: [],
      features: [{ ...features[0], placed: true }],
    });

    expect(
      screen.getByText('All art, furniture, and features are currently on the wall.'),
    ).toBeInTheDocument();
  });

  it('fires onAutoPlace and onOpenPlacementSettings from the staging actions', async () => {
    const user = userEvent.setup();
    const onAutoPlace = vi.fn();
    const onOpenPlacementSettings = vi.fn();
    renderTray({ onAutoPlace, onOpenPlacementSettings });

    await user.click(screen.getByRole('button', { name: 'Auto-place pieces' }));
    await user.click(screen.getByRole('button', { name: 'Auto-placement options' }));

    expect(onAutoPlace).toHaveBeenCalledTimes(1);
    expect(onOpenPlacementSettings).toHaveBeenCalledTimes(1);
  });
});

describe('StagedItem', () => {
  it('selects the item and places it on the wall', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onPlace = vi.fn();
    render(
      <StagedItem
        item={{ kind: 'artwork', artwork: pieces[0] }}
        selected={false}
        unit="in"
        onSelect={onSelect}
        onPointerDown={vi.fn()}
        onPlace={onPlace}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Drag Sunset from staging' }));
    expect(onSelect).toHaveBeenCalledWith('piece-1');

    await user.click(screen.getByRole('button', { name: 'Place Sunset on the wall' }));
    expect(onPlace).toHaveBeenCalledWith('piece-1');
  });

  it('omits the place control when onPlace is not provided', () => {
    render(
      <StagedItem
        item={{ kind: 'feature', feature: features[0] }}
        selected={false}
        unit="in"
        onSelect={vi.fn()}
        onPointerDown={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Place Sofa/ })).toBeNull();
  });
});
