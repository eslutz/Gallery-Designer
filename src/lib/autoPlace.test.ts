import { describe, expect, it } from 'vitest';
import { autoPlacePieces } from './autoPlace';
import { getAutoPlacementIssues } from './placement';
import type { ArtPiece, AutoPlacementSettings, Placement, WallSection } from '../types';

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

  it('keeps auto-placement out of a freely positioned feature clearance block', () => {
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
            id: 'cabinet',
            type: 'file-cabinet',
            name: 'File cabinet',
            xIn: 0,
            yIn: 40,
            widthIn: 120,
            heightIn: 24,
            placed: true,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.placements.every((placement) => placement.yIn + 18 <= 36 || placement.yIn >= 64),
    ).toBe(true);
  });

  it('ignores staged furniture and features during auto-placement', () => {
    const pieces: ArtPiece[] = [{ id: 'one', label: 'One', widthIn: 24, heightIn: 18 }];

    const result = autoPlacePieces(wall, pieces, {
      settings: {
        wallSetupMode: 'full-wall-with-features',
        context: { kind: 'blank', viewingPosture: 'seated' },
        layoutPreference: 'row',
        wallFeatures: [
          {
            id: 'cabinet',
            type: 'file-cabinet',
            name: 'File cabinet',
            xIn: 0,
            yIn: 0,
            widthIn: 120,
            heightIn: 96,
            placed: false,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
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

  it('packs mixed-size pieces into a stepped available wall', () => {
    const steppedWall: WallSection[] = [
      {
        id: 'left',
        name: 'Section 1',
        widthIn: 79,
        heightIn: 60,
        cornerAfter: 'none',
        xIn: 0,
        yIn: -23.875,
      },
      {
        id: 'right',
        name: 'Section 2',
        widthIn: 59,
        heightIn: 36,
        cornerAfter: 'none',
        xIn: 79,
        yIn: -23.875,
      },
    ];
    const pieces: ArtPiece[] = [
      { id: 'fallout', label: 'Fallout Shelter', widthIn: 10, heightIn: 14 },
      { id: 'doctor-who', label: 'Doctor Who', widthIn: 12.5, heightIn: 18 },
      { id: 'duke', label: 'Duke Nukem', widthIn: 12.5, heightIn: 18 },
      { id: 'walking-dead', label: 'The Walking Dead', widthIn: 11.5, heightIn: 17.5 },
      { id: 'riker', label: 'Riker', widthIn: 12.5, heightIn: 16 },
      { id: 'office', label: 'The Office', widthIn: 17, heightIn: 13.5 },
      { id: 'it-wide', label: 'The IT Crowd', widthIn: 27, heightIn: 15 },
      { id: 'ash', label: 'Ash', widthIn: 13, heightIn: 28 },
      { id: 'it-tall', label: 'The IT Crowd', widthIn: 17, heightIn: 21 },
      { id: 'expanse', label: 'The Expanse', widthIn: 18, heightIn: 24 },
      { id: 'silicon-valley', label: 'Silicon Valley', widthIn: 17, heightIn: 25 },
      { id: 'mcrn', label: 'MCRN', widthIn: 3.25, heightIn: 9.75 },
    ];

    const result = autoPlacePieces(steppedWall, pieces, { settings: blankSettings });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layoutKind).toBe('packed');
    expect(result.placements).toHaveLength(pieces.length);
    expect(getAutoPlacementIssues(steppedWall, pieces, result.placements)).toEqual([]);

    const fixedPlacement = result.placements.find((placement) => placement.pieceId === 'expanse')!;
    const partialResult = autoPlacePieces(steppedWall, pieces, {
      settings: blankSettings,
      existingPlacements: [fixedPlacement],
    });
    expect(partialResult.ok, partialResult.ok ? undefined : partialResult.message).toBe(true);
    if (!partialResult.ok) return;
    expect(partialResult.placements[0]).toBe(fixedPlacement);
    expect(partialResult.preservedPlacementCount).toBe(1);
    expect(partialResult.newPlacementCount).toBe(pieces.length - 1);
    expect(getAutoPlacementIssues(steppedWall, pieces, partialResult.placements)).toEqual([]);
  });

  it('returns actionable diagnostics when no layout family can fit', () => {
    const result = autoPlacePieces(
      [{ id: 'small', name: 'Small', widthIn: 40, heightIn: 30, cornerAfter: 'none' }],
      [
        { id: 'one', label: 'One', widthIn: 12, heightIn: 12 },
        { id: 'two', label: 'Two', widthIn: 13, heightIn: 12 },
        { id: 'three', label: 'Three', widthIn: 12, heightIn: 13 },
      ],
      { settings: blankSettings },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toMatchObject({
      resolvedGapIn: 2,
      resolvedOuterMarginIn: 5,
      wallWidthIn: 40,
      wallHeightIn: 30,
    });
    expect(result.diagnostics.attempts.map((attempt) => attempt.family)).toEqual([
      'row',
      'stack',
      'salon',
      'packed',
    ]);
    expect(result.diagnostics.attempts.every((attempt) => attempt.reason.length > 0)).toBe(true);
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

  it('preserves existing placements exactly and places only the remaining pieces', () => {
    const pieces: ArtPiece[] = [
      { id: 'fixed', label: 'Fixed', widthIn: 16, heightIn: 20 },
      { id: 'second', label: 'Second', widthIn: 14, heightIn: 18 },
      { id: 'third', label: 'Third', widthIn: 12, heightIn: 16 },
    ];
    const existingPlacements: Placement[] = [
      { pieceId: 'fixed', sectionId: 'main', xIn: 42.25, yIn: 31.5 },
    ];

    const result = autoPlacePieces(wall, pieces, {
      settings: blankSettings,
      existingPlacements,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preservedPlacementCount).toBe(1);
    expect(result.newPlacementCount).toBe(2);
    expect(result.placements).toHaveLength(3);
    expect(result.placements[0]).toBe(existingPlacements[0]);
    expect(result.placements[0]).toEqual(existingPlacements[0]);
    expect(getAutoPlacementIssues(wall, pieces, result.placements)).toEqual([]);
  });

  it('returns an unchanged no-op result when every piece is already placed', () => {
    const pieces: ArtPiece[] = [
      { id: 'one', label: 'One', widthIn: 12, heightIn: 12 },
      { id: 'two', label: 'Two', widthIn: 12, heightIn: 12 },
    ];
    const existingPlacements: Placement[] = [
      { pieceId: 'one', sectionId: 'main', xIn: 20, yIn: 20 },
      { pieceId: 'two', sectionId: 'main', xIn: 40, yIn: 20 },
    ];

    const result = autoPlacePieces(wall, pieces, {
      settings: blankSettings,
      existingPlacements,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements).toEqual(existingPlacements);
    expect(result.preservedPlacementCount).toBe(2);
    expect(result.newPlacementCount).toBe(0);
    expect(result.explanation).toBe(
      'All art pieces are already placed. Auto-placement made no changes.',
    );
  });

  it('rejects invalid existing placements before placing remaining pieces', () => {
    const pieces: ArtPiece[] = [
      { id: 'outside', label: 'Outside', widthIn: 20, heightIn: 20 },
      { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
    ];

    const result = autoPlacePieces(wall, pieces, {
      settings: blankSettings,
      existingPlacements: [{ pieceId: 'outside', sectionId: 'main', xIn: 110, yIn: 20 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/existing placements need attention/i);
    expect(result.message).toMatch(/Outside extends beyond the wall boundary/i);
    expect(result.diagnostics).toMatchObject({
      preservedPlacementCount: 1,
      remainingPieceCount: 1,
    });
  });

  it('reports preserved and remaining counts when partial placement cannot fit', () => {
    const smallWall: WallSection[] = [
      { id: 'small', name: 'Small', widthIn: 40, heightIn: 30, cornerAfter: 'none' },
    ];
    const pieces: ArtPiece[] = [
      { id: 'fixed', label: 'Fixed', widthIn: 12, heightIn: 12 },
      { id: 'two', label: 'Two', widthIn: 13, heightIn: 13 },
      { id: 'three', label: 'Three', widthIn: 13, heightIn: 13 },
    ];

    const result = autoPlacePieces(smallWall, pieces, {
      settings: blankSettings,
      existingPlacements: [{ pieceId: 'fixed', sectionId: 'small', xIn: 5, yIn: 5 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/Kept 1 placed piece in position/i);
    expect(result.message).toMatch(/2 remaining pieces/i);
    expect(result.diagnostics).toMatchObject({
      preservedPlacementCount: 1,
      remainingPieceCount: 2,
    });
  });

  it('continues a row from a fixed piece using its horizontal center', () => {
    const pieces: ArtPiece[] = [
      { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 20 },
      { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
    ];
    const result = autoPlacePieces(wall, pieces, {
      settings: { ...blankSettings, layoutPreference: 'row' },
      existingPlacements: [{ pieceId: 'fixed', sectionId: 'main', xIn: 40, yIn: 30 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const remaining = result.placements.find((placement) => placement.pieceId === 'remaining')!;
    expect(remaining.yIn + 6).toBe(40);
  });

  it('continues a stack from a fixed piece using its vertical center', () => {
    const pieces: ArtPiece[] = [
      { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 20 },
      { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
    ];
    const result = autoPlacePieces(wall, pieces, {
      settings: { ...blankSettings, layoutPreference: 'stack' },
      existingPlacements: [{ pieceId: 'fixed', sectionId: 'main', xIn: 40, yIn: 30 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const remaining = result.placements.find((placement) => placement.pieceId === 'remaining')!;
    expect(remaining.xIn + 6).toBe(50);
  });

  it('continues the spacing rhythm inferred from multiple fixed pieces', () => {
    const pieces: ArtPiece[] = [
      { id: 'first', label: 'First', widthIn: 10, heightIn: 10 },
      { id: 'second', label: 'Second', widthIn: 10, heightIn: 10 },
      { id: 'remaining', label: 'Remaining', widthIn: 10, heightIn: 10 },
    ];
    const existingPlacements: Placement[] = [
      { pieceId: 'first', sectionId: 'main', xIn: 30, yIn: 30 },
      { pieceId: 'second', sectionId: 'main', xIn: 48, yIn: 30 },
    ];
    const result = autoPlacePieces(wall, pieces, {
      settings: { ...blankSettings, layoutPreference: 'row' },
      existingPlacements,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const remaining = result.placements.find((placement) => placement.pieceId === 'remaining')!;
    expect(remaining.yIn).toBe(30);
    expect([12, 66]).toContain(remaining.xIn);
  });

  it('keeps fixed pieces inside the wall even when they are closer than the automatic margin', () => {
    const pieces: ArtPiece[] = [
      { id: 'fixed', label: 'Fixed', widthIn: 12, heightIn: 12 },
      { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
    ];
    const existingPlacement: Placement = {
      pieceId: 'fixed',
      sectionId: 'main',
      xIn: 1,
      yIn: 1,
    };
    const result = autoPlacePieces(wall, pieces, {
      settings: blankSettings,
      existingPlacements: [existingPlacement],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements[0]).toBe(existingPlacement);
    expect(result.newPlacementCount).toBe(1);
  });

  it('keeps the configured art buffer between fixed and newly placed pieces', () => {
    const pieces: ArtPiece[] = [
      { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 20 },
      { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
    ];
    const result = autoPlacePieces(wall, pieces, {
      settings: blankSettings,
      features: {
        snapToGrid: false,
        gridSizeIn: 1,
        snapToAlignment: false,
        alignmentToleranceIn: 1,
        wallEdgeBuffer: false,
        wallEdgeBufferGapIn: 0,
        artPieceBuffer: true,
        artPieceBufferGapIn: 8,
        measurementReferenceMode: 'relative',
      },
      existingPlacements: [{ pieceId: 'fixed', sectionId: 'main', xIn: 40, yIn: 30 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const remaining = result.placements.find((placement) => placement.pieceId === 'remaining')!;
    const horizontalGap = Math.max(40 - (remaining.xIn + 12), remaining.xIn - 60, 0);
    const verticalGap = Math.max(30 - (remaining.yIn + 12), remaining.yIn - 50, 0);
    expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(8);
  });

  it('places remaining pieces around fixed art without entering wall features', () => {
    const pieces: ArtPiece[] = [
      { id: 'fixed', label: 'Fixed', widthIn: 12, heightIn: 12 },
      { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
    ];
    const result = autoPlacePieces(wall, pieces, {
      settings: {
        ...blankSettings,
        wallSetupMode: 'full-wall-with-features',
        wallFeatures: [
          {
            id: 'blocked',
            type: 'custom',
            name: 'Blocked lower wall',
            xIn: 0,
            widthIn: 120,
            heightIn: 55,
            clearanceOverrideIn: 5,
          },
        ],
      },
      existingPlacements: [{ pieceId: 'fixed', sectionId: 'main', xIn: 20, yIn: 8 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const remaining = result.placements.find((placement) => placement.pieceId === 'remaining')!;
    expect(remaining.yIn + 12).toBeLessThanOrEqual(36);
  });

  it.each(['grid', 'salon', 'auto'] as const)(
    'uses fixed alignment guides with the %s preference',
    (layoutPreference) => {
      const pieces: ArtPiece[] = [
        { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 20 },
        { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
      ];
      const result = autoPlacePieces(wall, pieces, {
        settings: { ...blankSettings, layoutPreference },
        existingPlacements: [{ pieceId: 'fixed', sectionId: 'main', xIn: 40, yIn: 30 }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const remaining = result.placements.find((placement) => placement.pieceId === 'remaining')!;
      const verticalGuides = new Set([40, 50, 60]);
      const horizontalGuides = new Set([30, 40, 50]);
      expect(
        [remaining.xIn, remaining.xIn + 6, remaining.xIn + 12].some((value) =>
          verticalGuides.has(value),
        ) ||
          [remaining.yIn, remaining.yIn + 6, remaining.yIn + 12].some((value) =>
            horizontalGuides.has(value),
          ),
      ).toBe(true);
    },
  );
});
