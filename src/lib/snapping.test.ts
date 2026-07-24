import { describe, expect, it } from 'vitest';
import {
  applyFeaturePlacementFeatures,
  applyFeaturePlacementFeaturesWithMetadata,
  applyPlacementFeatures,
  applyPlacementFeaturesWithMetadata,
  applyPlacementGroupFeatures,
  applyPlacementGroupFeaturesWithMetadata,
} from './snapping';
import type { ArtPiece, EditorFeatures, Placement, WallFeature, WallSection } from '../types';

const sections: WallSection[] = [
  { id: 'wall', name: 'Wall', widthIn: 96, heightIn: 84, xIn: 0, yIn: 0 },
];

const pieces: ArtPiece[] = [
  { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
  { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
];

const baseFeatures: EditorFeatures = {
  snapToGrid: false,
  gridSizeIn: 1,
  snapToAlignment: false,
  showAlignmentGuides: true,
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

  it('snaps to nearby artwork vertical centers and returns guide metadata', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 14.5, yIn: 10 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value.xIn).toBe(14);
    expect(snapped.guides).toContainEqual({ axis: 'x', coordinateIn: 20, kind: 'center' });
  });

  it('snaps to nearby artwork horizontal centers and returns guide metadata', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 14, yIn: 13.5 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value.yIn).toBe(13);
    expect(snapped.guides).toContainEqual({ axis: 'y', coordinateIn: 18, kind: 'center' });
  });

  it('does not match moving centers to target edges', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 24, yIn: 40 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value).toEqual(placement);
    expect(snapped.guides).toEqual([]);
  });

  it('does not use wall centers as center alignment targets', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 41.5, yIn: 40 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value).toEqual(placement);
    expect(snapped.guides).toEqual([]);
  });

  it('does not use feature centers as center alignment targets', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 14.5, yIn: 40 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [],
      featureRects: [
        {
          id: 'file-cabinet',
          type: 'file-cabinet',
          name: 'File cabinet',
          xIn: 10,
          yIn: 10,
          widthIn: 20,
          heightIn: 28,
          placed: true,
        },
      ],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value).toEqual(placement);
    expect(snapped.guides).toEqual([]);
  });

  it('reports alignment guide metadata when snapping is disabled but guides are enabled', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 14.5, yIn: 40 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: {
        ...baseFeatures,
        snapToAlignment: false,
        showAlignmentGuides: true,
        alignmentToleranceIn: 1,
      },
    });

    expect(snapped.value).toEqual(placement);
    expect(snapped.guides).toContainEqual({ axis: 'x', coordinateIn: 20, kind: 'center' });
  });

  it('prefers edge alignment over center alignment when distances tie', () => {
    const wideMoving: ArtPiece = {
      id: 'wide-moving',
      label: 'Wide moving',
      widthIn: 20,
      heightIn: 10,
    };
    const placement: Placement = { pieceId: 'wide-moving', sectionId: 'wall', xIn: -11, yIn: 10 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: wideMoving,
      sections,
      pieces: [...pieces, wideMoving],
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value.xIn).toBe(-10);
    expect(snapped.guides).toContainEqual({ axis: 'x', coordinateIn: 10, kind: 'edge' });
  });

  it('ignores a piece with no line of sight to the moving piece (diagonal, no shared row or column)', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 50, yIn: 40 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value).toEqual(placement);
    expect(snapped.guides).toEqual([]);
  });

  it('occludes a farther piece behind a nearer one sharing the same lane', () => {
    // near: right edge at 30, far: right edge at 52 — both in the moving piece's row,
    // so near sits directly between far and the moving piece approaching from the right.
    const near: ArtPiece = { id: 'near', label: 'Near', widthIn: 20, heightIn: 16 };
    const far: ArtPiece = { id: 'far', label: 'Far', widthIn: 20, heightIn: 16 };
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 53, yIn: 10 };
    const nearPlacement: Placement = { pieceId: 'near', sectionId: 'wall', xIn: 10, yIn: 10 };
    const farPlacement: Placement = { pieceId: 'far', sectionId: 'wall', xIn: 32, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces: [...pieces, near, far],
      placements: [nearPlacement, farPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 2 },
    });

    // Snaps to "far"'s edge (52), not "near"'s (30) — far is the nearer neighbor from
    // the moving piece's side, so it occludes near, the piece further behind it.
    expect(snapped.value.xIn).toBe(52);
    expect(snapped.guides).toContainEqual({ axis: 'x', coordinateIn: 52, kind: 'edge' });
    expect(snapped.guides).not.toContainEqual({ axis: 'x', coordinateIn: 30, kind: 'edge' });
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

  it('snaps dragged furniture and features to the configured grid size', () => {
    const feature: WallFeature = {
      id: 'lamp',
      type: 'lamp',
      name: 'Lamp',
      xIn: 13.1,
      yIn: 16.9,
      widthIn: 14,
      heightIn: 36,
      placed: true,
    };

    expect(
      applyFeaturePlacementFeatures({
        feature,
        sections,
        pieces,
        placements: [],
        featureRects: [],
        features: { ...baseFeatures, snapToGrid: true, gridSizeIn: 6 },
      }),
    ).toEqual({ xIn: 12, yIn: 18 });
  });

  it('snaps art alignment to placed furniture and feature edges', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 31.5, yIn: 10 };

    expect(
      applyPlacementFeatures({
        placement,
        piece: pieces[0],
        sections,
        pieces,
        placements: [],
        featureRects: [
          {
            id: 'file-cabinet',
            type: 'file-cabinet',
            name: 'File cabinet',
            xIn: 10,
            yIn: 10,
            widthIn: 20,
            heightIn: 28,
            placed: true,
          },
        ],
        features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 2 },
      }).xIn,
    ).toBe(30);
  });

  it('keeps furniture alignment snapping edge-only while returning edge guide metadata', () => {
    const feature: WallFeature = {
      id: 'lamp',
      type: 'lamp',
      name: 'Lamp',
      xIn: 31.5,
      yIn: 10,
      widthIn: 14,
      heightIn: 36,
      placed: true,
    };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyFeaturePlacementFeaturesWithMetadata({
      feature,
      sections,
      pieces,
      placements: [fixedPlacement],
      featureRects: [],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 2 },
    });

    expect(snapped.value.xIn).toBe(30);
    expect(snapped.guides).toContainEqual({ axis: 'x', coordinateIn: 30, kind: 'edge' });
  });

  it('snaps a placement group with one shared grid delta', () => {
    const groupPieces: ArtPiece[] = [
      pieces[0],
      { id: 'group-member', label: 'Group member', widthIn: 8, heightIn: 8 },
    ];
    const proposed: Placement[] = [
      { pieceId: 'moving', sectionId: 'wall', xIn: 13.1, yIn: 16.9 },
      { pieceId: 'group-member', sectionId: 'wall', xIn: 30.1, yIn: 20.9 },
    ];

    expect(
      applyPlacementGroupFeatures({
        proposedPlacements: proposed,
        movingPieceIds: ['moving', 'group-member'],
        sections,
        pieces: groupPieces,
        placements: proposed,
        features: { ...baseFeatures, snapToGrid: true, gridSizeIn: 6 },
      }),
    ).toEqual([
      { ...proposed[0], xIn: 12, yIn: 18 },
      { ...proposed[1], xIn: 29, yIn: 22 },
    ]);
  });

  it('excludes every moving group member from alignment targets', () => {
    const groupMember: ArtPiece = {
      id: 'group-member',
      label: 'Group member',
      widthIn: 8,
      heightIn: 8,
    };
    const proposed: Placement[] = [
      { pieceId: 'moving', sectionId: 'wall', xIn: 31.5, yIn: 10 },
      { pieceId: 'group-member', sectionId: 'wall', xIn: 50, yIn: 10 },
    ];
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    expect(
      applyPlacementGroupFeatures({
        proposedPlacements: proposed,
        movingPieceIds: ['moving', 'group-member'],
        sections,
        pieces: [...pieces, groupMember],
        placements: [...proposed, fixedPlacement],
        features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 2 },
      }).map(({ xIn }) => xIn),
    ).toEqual([30, 48.5]);
  });

  it('snaps a placement group to the wall edge buffer using the group bounds', () => {
    const groupMember: ArtPiece = {
      id: 'group-member',
      label: 'Group member',
      widthIn: 8,
      heightIn: 8,
    };
    const proposed: Placement[] = [
      { pieceId: 'moving', sectionId: 'wall', xIn: 1.25, yIn: 2.5 },
      { pieceId: 'group-member', sectionId: 'wall', xIn: 20.25, yIn: 4.5 },
    ];

    expect(
      applyPlacementGroupFeatures({
        proposedPlacements: proposed,
        movingPieceIds: ['moving', 'group-member'],
        sections,
        pieces: [...pieces, groupMember],
        placements: proposed,
        features: { ...baseFeatures, wallEdgeBuffer: true, wallEdgeBufferGapIn: 2 },
      }),
    ).toEqual([
      { ...proposed[0], xIn: 2, yIn: 2 },
      { ...proposed[1], xIn: 21, yIn: 4 },
    ]);
  });

  it('snaps a placement group to the art piece buffer using the group bounds', () => {
    const groupMember: ArtPiece = {
      id: 'group-member',
      label: 'Group member',
      widthIn: 8,
      heightIn: 8,
    };
    const proposed: Placement[] = [
      { pieceId: 'moving', sectionId: 'wall', xIn: 31.25, yIn: 10 },
      { pieceId: 'group-member', sectionId: 'wall', xIn: 50.25, yIn: 12 },
    ];
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    expect(
      applyPlacementGroupFeatures({
        proposedPlacements: proposed,
        movingPieceIds: ['moving', 'group-member'],
        sections,
        pieces: [...pieces, groupMember],
        placements: [...proposed, fixedPlacement],
        features: { ...baseFeatures, artPieceBuffer: true, artPieceBufferGapIn: 2 },
      }).map(({ xIn }) => xIn),
    ).toEqual([32, 51]);
  });

  it('returns group edge and center alignment guides from the group bounds', () => {
    const groupMember: ArtPiece = {
      id: 'group-member',
      label: 'Group member',
      widthIn: 8,
      heightIn: 8,
    };
    const proposed: Placement[] = [
      { pieceId: 'moving', sectionId: 'wall', xIn: 31.5, yIn: 12.5 },
      { pieceId: 'group-member', sectionId: 'wall', xIn: 50, yIn: 12.5 },
    ];
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementGroupFeaturesWithMetadata({
      proposedPlacements: proposed,
      movingPieceIds: ['moving', 'group-member'],
      sections,
      pieces: [...pieces, groupMember],
      placements: [...proposed, fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 2 },
    });

    expect(snapped.value.map(({ xIn, yIn }) => ({ xIn, yIn }))).toEqual([
      { xIn: 30, yIn: 13 },
      { xIn: 48.5, yIn: 13 },
    ]);
    expect(snapped.guides).toContainEqual({ axis: 'x', coordinateIn: 30, kind: 'edge' });
    expect(snapped.guides).toContainEqual({ axis: 'y', coordinateIn: 18, kind: 'center' });
  });
});
