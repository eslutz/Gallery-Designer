import type { ArtPiece, EditorFeatures, Placement, WallFeature, WallSection } from '../types';
import { getGroupBounds, translatePlacementGroup } from './multiSelection';
import { globalRectForPlacement } from './placement';
import { roundToPrecision } from './units';
import {
  getInsetWallExteriorEdges,
  getSectionOffsetX,
  getSectionOffsetY,
  getWallBounds,
} from './wall';

interface SnapInput {
  placement: Placement;
  piece: ArtPiece;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  featureRects?: WallFeature[];
}

interface FeatureSnapInput {
  feature: WallFeature;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  featureRects: WallFeature[];
}

interface PlacementGroupSnapInput {
  proposedPlacements: Placement[];
  movingPieceIds: string[];
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  featureRects?: WallFeature[];
}

interface SnapAxisCandidate {
  movingValue: number;
  targetValue: number;
}

interface AxisTargets {
  x: number[];
  y: number[];
}

interface SnapRect {
  id: string;
  left: number;
  top: number;
  widthIn: number;
  heightIn: number;
}

export function applyPlacementFeatures({
  placement,
  piece,
  sections,
  pieces,
  placements,
  features,
  featureRects = [],
}: SnapInput): Placement {
  const offsetX = getSectionOffsetX(sections, placement.sectionId);
  const offsetY = getSectionOffsetY(sections, placement.sectionId);
  const snapped = applyRectPlacementFeatures({
    rect: {
      id: placement.pieceId,
      left: offsetX + placement.xIn,
      top: offsetY + placement.yIn,
      widthIn: piece.widthIn,
      heightIn: piece.heightIn,
    },
    sections,
    features,
    staticRects: [
      ...artRectsFromPlacements(sections, pieces, placements, [placement.pieceId]),
      ...featureRectsFromFeatures(featureRects),
    ],
  });

  return {
    ...placement,
    xIn: roundToPrecision(snapped.left - offsetX),
    yIn: roundToPrecision(snapped.top - offsetY),
  };
}

export function applyPlacementGroupFeatures({
  proposedPlacements,
  movingPieceIds,
  sections,
  pieces,
  placements,
  features,
  featureRects = [],
}: PlacementGroupSnapInput): Placement[] {
  const bounds = getGroupBounds(sections, pieces, proposedPlacements, movingPieceIds);
  if (!bounds) {
    return [];
  }
  const snapped = applyRectPlacementFeatures({
    rect: {
      id: 'placement-group',
      left: bounds.left,
      top: bounds.top,
      widthIn: bounds.right - bounds.left,
      heightIn: bounds.bottom - bounds.top,
    },
    sections,
    features,
    staticRects: [
      ...artRectsFromPlacements(sections, pieces, placements, movingPieceIds),
      ...featureRectsFromFeatures(featureRects),
    ],
  });
  return translatePlacementGroup(
    sections,
    pieces,
    proposedPlacements,
    movingPieceIds,
    snapped.left - bounds.left,
    snapped.top - bounds.top,
  );
}

export function applyFeaturePlacementFeatures({
  feature,
  sections,
  pieces,
  placements,
  features,
  featureRects,
}: FeatureSnapInput): Pick<WallFeature, 'xIn' | 'yIn'> {
  const snapped = applyRectPlacementFeatures({
    rect: {
      id: feature.id,
      left: feature.xIn,
      top: feature.yIn ?? 0,
      widthIn: feature.widthIn,
      heightIn: feature.heightIn,
    },
    sections,
    features,
    staticRects: [
      ...artRectsFromPlacements(sections, pieces, placements, []),
      ...featureRectsFromFeatures(featureRects.filter((candidate) => candidate.id !== feature.id)),
    ],
  });

  return {
    xIn: roundToPrecision(snapped.left),
    yIn: roundToPrecision(snapped.top),
  };
}

function applyRectPlacementFeatures({
  rect,
  sections,
  features,
  staticRects,
}: {
  rect: SnapRect;
  sections: WallSection[];
  features: EditorFeatures;
  staticRects: SnapRect[];
}): Pick<SnapRect, 'left' | 'top'> {
  let next = rect;

  if (features.snapToGrid && features.gridSizeIn > 0) {
    next = {
      ...next,
      left: roundToPrecision(next.left, features.gridSizeIn),
      top: roundToPrecision(next.top, features.gridSizeIn),
    };
  }

  const bufferTolerance = Math.max(0.125, features.alignmentToleranceIn);

  if (features.wallEdgeBuffer && features.wallEdgeBufferGapIn > 0) {
    next = snapRectToTargets(
      next,
      wallEdgeBufferTargets(sections, features.wallEdgeBufferGapIn),
      bufferTolerance,
    );
  }

  if (features.artPieceBuffer && features.artPieceBufferGapIn > 0) {
    next = snapRectToTargets(
      next,
      bufferTargets(staticRects, features.artPieceBufferGapIn),
      bufferTolerance,
    );
  }

  if (features.snapToAlignment && features.alignmentToleranceIn > 0) {
    next = snapRectToAlignment(next, sections, staticRects, features.alignmentToleranceIn);
  }

  return {
    left: next.left,
    top: next.top,
  };
}

function snapRectToTargets(rect: SnapRect, targets: AxisTargets, toleranceIn: number): SnapRect {
  const moving = rectEdges(rect);
  const xDelta = closestDelta(
    [
      { movingValue: moving.left, targetValue: 0 },
      { movingValue: moving.right, targetValue: 0 },
    ],
    targets.x,
    toleranceIn,
  );
  const yDelta = closestDelta(
    [
      { movingValue: moving.top, targetValue: 0 },
      { movingValue: moving.bottom, targetValue: 0 },
    ],
    targets.y,
    toleranceIn,
  );

  return {
    ...rect,
    left: xDelta === undefined ? rect.left : roundToPrecision(moving.left + xDelta),
    top: yDelta === undefined ? rect.top : roundToPrecision(moving.top + yDelta),
  };
}

function wallEdgeBufferTargets(sections: WallSection[], gapIn: number): AxisTargets {
  const targets: AxisTargets = { x: [], y: [] };

  for (const edge of getInsetWallExteriorEdges(sections, gapIn)) {
    const vertical = edge.x1 === edge.x2;
    if (vertical) {
      targets.x.push(edge.x1);
    } else {
      targets.y.push(edge.y1);
    }
  }

  return targets;
}

function bufferTargets(rects: SnapRect[], gapIn: number): AxisTargets {
  const targets: AxisTargets = { x: [], y: [] };

  for (const rect of rects) {
    targets.x.push(rect.left - gapIn, rect.left + rect.widthIn + gapIn);
    targets.y.push(rect.top - gapIn, rect.top + rect.heightIn + gapIn);
  }

  return targets;
}

function artRectsFromPlacements(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  movingPieceIds: Iterable<string>,
): SnapRect[] {
  const excludedPieceIds = new Set(movingPieceIds);
  return placements.flatMap((placement) => {
    if (excludedPieceIds.has(placement.pieceId)) {
      return [];
    }
    const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
    if (!piece) {
      return [];
    }
    const rect = globalRectForPlacement(sections, placement, piece);
    return [
      {
        id: placement.pieceId,
        left: rect.left,
        top: rect.top,
        widthIn: piece.widthIn,
        heightIn: piece.heightIn,
      },
    ];
  });
}

function featureRectsFromFeatures(features: WallFeature[]): SnapRect[] {
  return features
    .filter((feature) => feature.placed !== false && typeof feature.yIn === 'number')
    .map((feature) => ({
      id: feature.id,
      left: feature.xIn,
      top: feature.yIn ?? 0,
      widthIn: feature.widthIn,
      heightIn: feature.heightIn,
    }));
}

function snapRectToAlignment(
  rect: SnapRect,
  sections: WallSection[],
  staticRects: SnapRect[],
  toleranceIn: number,
): SnapRect {
  const moving = rectEdges(rect);
  const targetX = alignmentTargetsX(sections, staticRects);
  const targetY = alignmentTargetsY(sections, staticRects);

  const xDelta = closestDelta(
    [
      { movingValue: moving.left, targetValue: 0 },
      { movingValue: moving.right, targetValue: 0 },
      { movingValue: (moving.left + moving.right) / 2, targetValue: 0 },
    ],
    targetX,
    toleranceIn,
  );
  const yDelta = closestDelta(
    [
      { movingValue: moving.top, targetValue: 0 },
      { movingValue: moving.bottom, targetValue: 0 },
      { movingValue: (moving.top + moving.bottom) / 2, targetValue: 0 },
    ],
    targetY,
    toleranceIn,
  );

  return {
    ...rect,
    left: xDelta === undefined ? rect.left : roundToPrecision(moving.left + xDelta),
    top: yDelta === undefined ? rect.top : roundToPrecision(moving.top + yDelta),
  };
}

function alignmentTargetsX(sections: WallSection[], rects: SnapRect[]): number[] {
  const bounds = getWallBounds(sections);
  return [
    bounds.minX,
    bounds.maxX,
    (bounds.minX + bounds.maxX) / 2,
    ...rects.flatMap((rect) => [rect.left, rect.left + rect.widthIn, rect.left + rect.widthIn / 2]),
  ];
}

function alignmentTargetsY(sections: WallSection[], rects: SnapRect[]): number[] {
  const bounds = getWallBounds(sections);
  return [
    bounds.minY,
    bounds.maxY,
    (bounds.minY + bounds.maxY) / 2,
    ...rects.flatMap((rect) => [rect.top, rect.top + rect.heightIn, rect.top + rect.heightIn / 2]),
  ];
}

function rectEdges(rect: SnapRect) {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.widthIn,
    bottom: rect.top + rect.heightIn,
  };
}

function closestDelta(
  movingCandidates: SnapAxisCandidate[],
  targets: number[],
  toleranceIn: number,
): number | undefined {
  let best: { delta: number; distance: number } | undefined;

  for (const moving of movingCandidates) {
    for (const targetValue of targets) {
      const delta = targetValue - moving.movingValue;
      const distance = Math.abs(delta);
      if (distance <= toleranceIn && (!best || distance < best.distance)) {
        best = { delta, distance };
      }
    }
  }

  return best?.delta;
}
