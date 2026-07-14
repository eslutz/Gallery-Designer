import { describe, expect, it } from 'vitest';
import { autoPlacePieces } from './autoPlace';
import { getAutoPlacementIssues } from './placement';
import type { ArtPiece, AutoPlacementSettings, WallSection } from '../types';

const wall: WallSection[] = [
  { id: 'main', name: 'Main wall', widthIn: 120, heightIn: 96, cornerAfter: 'none' },
];

describe('automatic placement', () => {
  const blankSettings: AutoPlacementSettings = {
    wallSetupMode: 'available-sections',
    context: { kind: 'blank', viewingPosture: 'seated' },
    layoutPreference: 'auto',
    wallFeatures: [],
  };

  it('uses a horizontal row above measured sofa feature when the full wall is wide', () => {
    const pieces: ArtPiece[] = [
      { id: 'one', label: 'One', widthIn: 18, heightIn: 12 },
      { id: 'two', label: 'Two', widthIn: 18, heightIn: 12 },
      { id: 'three', label: 'Three', widthIn: 18, heightIn: 12 },
    ];

    const result = autoPlacePieces(wall, pieces, {
      settings: {
        wallSetupMode: 'full-wall-with-features',
        context: { kind: 'blank', viewingPosture: 'seated' },
        layoutPreference: 'auto',
        wallFeatures: [
          {
            id: 'sofa',
            type: 'sofa',
            name: 'Sofa',
            xIn: 18,
            widthIn: 84,
            heightIn: 30,
            clearanceOverrideIn: 8,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layoutKind).toBe('row');
    expect(result.resolvedGapIn).toBe(2);
    expect(result.explanation).toMatch(/full wall/i);
    expect(result.placements.every((placement) => placement.yIn === result.placements[0].yIn)).toBe(
      true,
    );
    expect(result.placements.every((placement) => placement.yIn + 12 <= 58)).toBe(true);
  });

  it('treats custom full-wall features as block-only placement constraints', () => {
    const pieces: ArtPiece[] = [
      { id: 'one', label: 'One', widthIn: 24, heightIn: 18 },
      { id: 'two', label: 'Two', widthIn: 24, heightIn: 18 },
    ];

    const result = autoPlacePieces(wall, pieces, {
      settings: {
        wallSetupMode: 'full-wall-with-features',
        context: { kind: 'blank', viewingPosture: 'seated' },
        layoutPreference: 'row',
        wallFeatures: [
          {
            id: 'monitor',
            type: 'custom',
            name: 'Monitor area',
            xIn: 0,
            widthIn: 120,
            heightIn: 55,
            clearanceOverrideIn: 5,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.every((placement) => placement.yIn >= 5)).toBe(true);
    expect(result.placements.every((placement) => placement.yIn + 18 <= 36)).toBe(true);
  });

  it('keeps a mixed salon composition inside the connected wall union with quarter-inch precision', () => {
    const sections: WallSection[] = [
      { id: 'left', name: 'Left', widthIn: 60, heightIn: 84, cornerAfter: 'none', xIn: 0, yIn: 0 },
      {
        id: 'right',
        name: 'Right',
        widthIn: 60,
        heightIn: 84,
        cornerAfter: 'none',
        xIn: 60,
        yIn: 0,
      },
    ];
    const pieces: ArtPiece[] = [
      { id: 'anchor', label: 'Anchor', widthIn: 26, heightIn: 20 },
      { id: 'small', label: 'Small', widthIn: 12, heightIn: 10 },
      { id: 'wide', label: 'Wide', widthIn: 20, heightIn: 12 },
    ];

    const result = autoPlacePieces(sections, pieces, { settings: blankSettings });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layoutKind).toBe('salon');
    expect(result.placements.some((placement) => placement.sectionId === 'right')).toBe(true);
    expect(result.placements.every((placement) => Number.isInteger(placement.xIn * 4))).toBe(true);
    expect(getAutoPlacementIssues(sections, pieces, result.placements)).toEqual([]);
  });

  it('reports an honest failure when a requested family cannot fit', () => {
    const result = autoPlacePieces(
      [{ id: 'tiny', name: 'Tiny', widthIn: 20, heightIn: 20, cornerAfter: 'none' }],
      [{ id: 'one', label: 'One', widthIn: 12, heightIn: 12 }],
      { settings: { ...blankSettings, layoutPreference: 'row' } },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/margin|fit/i);
  });

  it('uses a grid for same-size pieces with consistent spacing', () => {
    const pieces: ArtPiece[] = Array.from({ length: 4 }, (_, index) => ({
      id: `p${index + 1}`,
      label: `Piece ${index + 1}`,
      widthIn: 12,
      heightIn: 12,
    }));

    const result = autoPlacePieces(wall, pieces, { settings: blankSettings });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layoutKind).toBe('grid');
    expect(new Set(result.placements.map((placement) => placement.yIn)).size).toBe(2);
    expect(getAutoPlacementIssues(wall, pieces, result.placements)).toEqual([]);
  });

  it('uses salon packing for mixed sizes without overlap', () => {
    const pieces: ArtPiece[] = [
      { id: 'large', label: 'Large', widthIn: 28, heightIn: 20 },
      { id: 'small', label: 'Small', widthIn: 12, heightIn: 10 },
      { id: 'wide', label: 'Wide', widthIn: 24, heightIn: 12 },
    ];

    const result = autoPlacePieces(wall, pieces, { settings: blankSettings });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layoutKind).toBe('salon');
    expect(getAutoPlacementIssues(wall, pieces, result.placements)).toEqual([]);
  });

  it('returns an explicit error when the wall cannot fit the pieces', () => {
    const result = autoPlacePieces(
      [{ id: 'tiny', name: 'Tiny', widthIn: 10, heightIn: 10, cornerAfter: 'none' }],
      [{ id: 'huge', label: 'Huge', widthIn: 20, heightIn: 20 }],
      { settings: blankSettings },
    );

    expect(result).toEqual({
      ok: false,
      message: 'Huge cannot fit within the wall margin.',
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

    const result = autoPlacePieces(multiSectionWall, pieces, { settings: blankSettings });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.placements.map((placement) => placement.sectionId))).toEqual(
      new Set(['left', 'right']),
    );
    expect(getAutoPlacementIssues(multiSectionWall, pieces, result.placements)).toEqual([]);
    expect(
      result.placements.every(
        (placement) =>
          placement.xIn >= 0 &&
          placement.yIn >= 5 &&
          placement.yIn + pieces.find((piece) => piece.id === placement.pieceId)!.heightIn <= 75,
      ),
    ).toBe(true);
  });
});
