import { describe, expect, it } from 'vitest';
import {
  applyFeaturePlacementFeatures,
  applyFeaturePlacementFeaturesWithMetadata,
  applyPlacementFeatures,
  applyPlacementFeaturesWithMetadata,
} from './snapping';
import type { ArtPiece, EditorFeatures, Placement, WallFeature, WallSection } from '../types';

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

  it('snaps vertical alignment center-to-center between artwork', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 13.5, yIn: 4 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 40 };

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

  it('snaps horizontal alignment center-to-center between differently sized artwork', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 4, yIn: 12.5 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 40, yIn: 10 };

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

  it('does not cross-match moving centers to target edges', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 23.5, yIn: 4 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 40 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value.xIn).toBe(placement.xIn);
    expect(snapped.guides).toEqual([]);
  });

  it('does not snap artwork centers to wall or feature centers', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 41.5, yIn: 4 };

    const wallCenterResult = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });
    const featureCenterResult = applyPlacementFeaturesWithMetadata({
      placement: { ...placement, xIn: 13.5 },
      piece: pieces[0],
      sections,
      pieces,
      placements: [],
      featureRects: [
        {
          id: 'window',
          type: 'window',
          name: 'Window',
          xIn: 10,
          yIn: 40,
          widthIn: 20,
          heightIn: 16,
          placed: true,
        },
      ],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(wallCenterResult.value.xIn).toBe(placement.xIn);
    expect(featureCenterResult.value.xIn).toBe(13.5);
  });

  it('prefers edge guides over center guides on exact ties', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 13.5, yIn: 4 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 14, yIn: 40 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value.xIn).toBe(14);
    expect(snapped.guides).toContainEqual({ axis: 'x', coordinateIn: 14, kind: 'edge' });
  });

  it('returns at most one horizontal and one vertical guide for a dual-axis snap', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 13.5, yIn: 12.5 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 };

    const snapped = applyPlacementFeaturesWithMetadata({
      placement,
      piece: pieces[0],
      sections,
      pieces,
      placements: [fixedPlacement],
      features: { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
    });

    expect(snapped.value).toMatchObject({ xIn: 14, yIn: 13 });
    expect(snapped.guides).toEqual([
      { axis: 'x', coordinateIn: 20, kind: 'center' },
      { axis: 'y', coordinateIn: 18, kind: 'center' },
    ]);
  });

  it('still reports alignment guides when snapping is disabled but guides are enabled', () => {
    const placement: Placement = { pieceId: 'moving', sectionId: 'wall', xIn: 13.5, yIn: 4 };
    const fixedPlacement: Placement = { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 40 };

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
});
