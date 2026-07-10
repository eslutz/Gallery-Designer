import { describe, expect, it } from 'vitest';
import { autoPlacePieces } from './autoPlace';
import { getAutoPlacementIssues } from './placement';
import type { ArtPiece, WallSection } from '../types';

const wall: WallSection[] = [
  { id: 'main', name: 'Main wall', widthIn: 120, heightIn: 96, cornerAfter: 'none' },
];

describe('automatic placement', () => {
  it('uses a grid for same-size pieces with consistent spacing', () => {
    const pieces: ArtPiece[] = Array.from({ length: 4 }, (_, index) => ({
      id: `p${index + 1}`,
      label: `Piece ${index + 1}`,
      widthIn: 12,
      heightIn: 12,
    }));

    const result = autoPlacePieces(wall, pieces);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layoutKind).toBe('grid');
    expect(new Set(result.placements.map((placement) => placement.yIn)).size).toBe(2);
    expect(getAutoPlacementIssues(wall, pieces, result.placements)).toEqual([]);
  });

  it('uses organic packing for mixed sizes without overlap', () => {
    const pieces: ArtPiece[] = [
      { id: 'large', label: 'Large', widthIn: 28, heightIn: 20 },
      { id: 'small', label: 'Small', widthIn: 12, heightIn: 10 },
      { id: 'wide', label: 'Wide', widthIn: 24, heightIn: 12 },
    ];

    const result = autoPlacePieces(wall, pieces);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layoutKind).toBe('organic');
    expect(getAutoPlacementIssues(wall, pieces, result.placements)).toEqual([]);
  });

  it('returns an explicit error when the wall cannot fit the pieces', () => {
    const result = autoPlacePieces(
      [{ id: 'tiny', name: 'Tiny', widthIn: 10, heightIn: 10, cornerAfter: 'none' }],
      [{ id: 'huge', label: 'Huge', widthIn: 20, heightIn: 20 }],
    );

    expect(result).toEqual({
      ok: false,
      message: 'Huge cannot fit on any wall section.',
    });
  });

  it('distributes pieces across connected wall sections and preserves a wall-edge buffer', () => {
    const multiSectionWall: WallSection[] = [
      { id: 'left', name: 'Left', widthIn: 80, heightIn: 80, cornerAfter: 'none', xIn: 0, yIn: 0 },
      {
        id: 'right',
        name: 'Right',
        widthIn: 80,
        heightIn: 80,
        cornerAfter: 'none',
        xIn: 80,
        yIn: 0,
      },
    ];
    const pieces: ArtPiece[] = Array.from({ length: 6 }, (_, index) => ({
      id: `piece-${index + 1}`,
      label: `Piece ${index + 1}`,
      widthIn: 16,
      heightIn: 12,
    }));

    const result = autoPlacePieces(multiSectionWall, pieces);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.placements.map((placement) => placement.sectionId))).toEqual(
      new Set(['left', 'right']),
    );
    expect(getAutoPlacementIssues(multiSectionWall, pieces, result.placements)).toEqual([]);
    expect(
      result.placements.every(
        (placement) =>
          placement.xIn >= 3 &&
          placement.yIn >= 3 &&
          placement.xIn + pieces.find((piece) => piece.id === placement.pieceId)!.widthIn <= 77 &&
          placement.yIn + pieces.find((piece) => piece.id === placement.pieceId)!.heightIn <= 77,
      ),
    ).toBe(true);
  });
});
