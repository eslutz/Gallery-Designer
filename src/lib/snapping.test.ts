import { describe, expect, it } from 'vitest';
import { applyPlacementFeatures } from './snapping';
import type { ArtPiece, EditorFeatures, Placement, WallSection } from '../types';

const sections: WallSection[] = [
  { id: 'wall', name: 'Wall', widthIn: 96, heightIn: 84, cornerAfter: 'none', xIn: 0, yIn: 0 },
];

const pieces: ArtPiece[] = [
  { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
  { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
];

const baseFeatures: EditorFeatures = {
  snapToGrid: false,
  gridSizeIn: 1,
  snapToAlignment: false,
  alignmentToleranceIn: 2,
  wallEdgeBuffer: false,
  wallEdgeBufferGapIn: 2,
  artPieceBuffer: false,
  artPieceBufferGapIn: 2,
  measurementReferenceMode: 'relative',
};

describe('placement snapping features', () => {
  it('snaps placement coordinates to the configured grid size', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 13.1, yIn: 16.9 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [],
        features: { ...baseFeatures, snapToGrid: true, gridSizeIn: 6 },
      }),
    ).toEqual({ ...placement, xIn: 12, yIn: 18 });
  });

  it('snaps to nearby piece edge alignment when enabled', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 31.5, yIn: 10 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [fixedPlacement],
        features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 2 },
      }).xIn,
    ).toBe(30);
  });

  it('leaves placement unchanged when snapping features are disabled', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 31.5, yIn: 10 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [fixedPlacement],
        features: baseFeatures,
      }),
    ).toEqual(placement);
  });

  it('magnetically snaps to the configured wall edge buffer when within tolerance', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 1.25, yIn: 2.5 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [],
        features: { ...baseFeatures, wallEdgeBuffer: true, wallEdgeBufferGapIn: 2 },
      }),
    ).toEqual({ ...placement, xIn: 2, yIn: 2 });
  });

  it('allows pieces to move past the wall edge buffer magnetic zone', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 6, yIn: 7 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [],
        features: { ...baseFeatures, wallEdgeBuffer: true, wallEdgeBufferGapIn: 2 },
      }),
    ).toEqual(placement);
  });

  it('magnetically snaps to the configured art piece buffer when within tolerance', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 31.25, yIn: 10 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [fixedPlacement],
        features: { ...baseFeatures, artPieceBuffer: true, artPieceBufferGapIn: 2 },
      }).xIn,
    ).toBe(32);
  });

  it('allows pieces to move past the art piece buffer magnetic zone', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 35, yIn: 22 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [fixedPlacement],
        features: { ...baseFeatures, artPieceBuffer: true, artPieceBufferGapIn: 2 },
      }),
    ).toEqual(placement);
  });
});
