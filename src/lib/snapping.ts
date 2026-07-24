import type { ArtPiece, EditorFeatures, Placement, WallFeature, WallSection } from '../types';
import { getGroupBounds, translatePlacementGroup } from './multiSelection';
import { globalRectForPlacement } from './placement';
import { roundToPrecision } from './units';
import { getInsetWallExteriorEdges, getSectionOffsetX, getSectionOffsetY } from './wall';

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
  kind: 'edge' | 'center';
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

export interface AlignmentGuide {
  axis: 'x' | 'y';
  coordinateIn: number;
  kind: 'edge' | 'center';
}

export interface SnapResult<T> {
  value: T;
  guides: AlignmentGuide[];
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
  return applyPlacementFeaturesWithMetadata({
    placement,
    piece,
    sections,
    pieces,
    placements,
    features,
    featureRects,
  }).value;
}

export function applyPlacementFeaturesWithMetadata({
  placement,
  piece,
  sections,
  pieces,
  placements,
  features,
  featureRects = [],
}: SnapInput): SnapResult<Placement> {
  const offsetX = getSectionOffsetX(sections, placement.sectionId);
  const offsetY = getSectionOffsetY(sections, placement.sectionId);
  const artRects = artRectsFromPlacements(sections, pieces, placements, [placement.pieceId]);
  const staticRects = featureRectsFromFeatures(featureRects);
  const snapped = applyRectPlacementFeaturesWithMetadata({
    rect: {
      id: placement.pieceId,
      left: offsetX + placement.xIn,
      top: offsetY + placement.yIn,
      widthIn: piece.widthIn,
      heightIn: piece.heightIn,
    },
    sections,
    features,
    edgeRects: [...artRects, ...staticRects],
    centerRects: artRects,
  });

  return {
    value: {
      ...placement,
      xIn: roundToPrecision(snapped.value.left - offsetX),
      yIn: roundToPrecision(snapped.value.top - offsetY),
    },
    guides: snapped.guides,
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
  return applyPlacementGroupFeaturesWithMetadata({
    proposedPlacements,
    movingPieceIds,
    sections,
    pieces,
    placements,
    features,
    featureRects,
  }).value;
}

export function applyPlacementGroupFeaturesWithMetadata({
  proposedPlacements,
  movingPieceIds,
  sections,
  pieces,
  placements,
  features,
  featureRects = [],
}: PlacementGroupSnapInput): SnapResult<Placement[]> {
  const bounds = getGroupBounds(sections, pieces, proposedPlacements, movingPieceIds);
  if (!bounds) {
    return { value: [], guides: [] };
  }
  const artRects = artRectsFromPlacements(sections, pieces, placements, movingPieceIds);
  const staticRects = [...artRects, ...featureRectsFromFeatures(featureRects)];
  const snapped = applyRectPlacementFeaturesWithMetadata({
    rect: {
      id: 'placement-group',
      left: bounds.left,
      top: bounds.top,
      widthIn: bounds.right - bounds.left,
      heightIn: bounds.bottom - bounds.top,
    },
    sections,
    features,
    edgeRects: staticRects,
    centerRects: artRects,
  });
  return {
    value: translatePlacementGroup(
      sections,
      pieces,
      proposedPlacements,
      movingPieceIds,
      snapped.value.left - bounds.left,
      snapped.value.top - bounds.top,
    ),
    guides: snapped.guides,
  };
}

export function applyFeaturePlacementFeatures({
  feature,
  sections,
  pieces,
  placements,
  features,
  featureRects,
}: FeatureSnapInput): Pick<WallFeature, 'xIn' | 'yIn'> {
  return applyFeaturePlacementFeaturesWithMetadata({
    feature,
    sections,
    pieces,
    placements,
    features,
    featureRects,
  }).value;
}

export function applyFeaturePlacementFeaturesWithMetadata({
  feature,
  sections,
  pieces,
  placements,
  features,
  featureRects,
}: FeatureSnapInput): SnapResult<Pick<WallFeature, 'xIn' | 'yIn'>> {
  const snapped = applyRectPlacementFeaturesWithMetadata({
    rect: {
      id: feature.id,
      left: feature.xIn,
      top: feature.yIn ?? 0,
      widthIn: feature.widthIn,
      heightIn: feature.heightIn,
    },
    sections,
    features,
    edgeRects: [
      ...artRectsFromPlacements(sections, pieces, placements, []),
      ...featureRectsFromFeatures(featureRects.filter((candidate) => candidate.id !== feature.id)),
    ],
    centerRects: [],
  });

  return {
    value: {
      xIn: roundToPrecision(snapped.value.left),
      yIn: roundToPrecision(snapped.value.top),
    },
    guides: snapped.guides,
  };
}

function applyRectPlacementFeaturesWithMetadata({
  rect,
  sections,
  features,
  edgeRects,
  centerRects,
}: {
  rect: SnapRect;
  sections: WallSection[];
  features: EditorFeatures;
  edgeRects: SnapRect[];
  centerRects: SnapRect[];
}): SnapResult<Pick<SnapRect, 'left' | 'top'>> {
  let next = rect;
  let guides: AlignmentGuide[] = [];

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
      bufferTargets(edgeRects, features.artPieceBufferGapIn),
      bufferTolerance,
    );
  }

  if (
    (features.snapToAlignment || features.showAlignmentGuides) &&
    features.alignmentToleranceIn > 0
  ) {
    const snapped = snapRectToAlignment({
      rect: next,
      edgeRects,
      centerRects,
      toleranceIn: features.alignmentToleranceIn,
    });
    guides = snapped.guides;
    if (features.snapToAlignment) {
      next = snapped.value;
    }
  }

  return {
    value: {
      left: next.left,
      top: next.top,
    },
    guides,
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

function snapRectToAlignment({
  rect,
  edgeRects,
  centerRects,
  toleranceIn,
}: {
  rect: SnapRect;
  edgeRects: SnapRect[];
  centerRects: SnapRect[];
  toleranceIn: number;
}): SnapResult<SnapRect> {
  const moving = rectEdges(rect);
  const visibleEdgeRects = nearestVisibleRects(rect, edgeRects);
  const visibleCenterRects = nearestVisibleRects(rect, centerRects);
  const targetX = alignmentTargetsX(visibleEdgeRects, visibleCenterRects);
  const targetY = alignmentTargetsY(visibleEdgeRects, visibleCenterRects);

  const xSnap = closestAlignmentDelta(
    [
      { movingValue: moving.left, targetValue: 0, kind: 'edge' },
      { movingValue: moving.right, targetValue: 0, kind: 'edge' },
      { movingValue: (moving.left + moving.right) / 2, targetValue: 0, kind: 'center' },
    ],
    targetX,
    toleranceIn,
  );
  const ySnap = closestAlignmentDelta(
    [
      { movingValue: moving.top, targetValue: 0, kind: 'edge' },
      { movingValue: moving.bottom, targetValue: 0, kind: 'edge' },
      { movingValue: (moving.top + moving.bottom) / 2, targetValue: 0, kind: 'center' },
    ],
    targetY,
    toleranceIn,
  );

  return {
    value: {
      ...rect,
      left: xSnap === undefined ? rect.left : roundToPrecision(moving.left + xSnap.delta),
      top: ySnap === undefined ? rect.top : roundToPrecision(moving.top + ySnap.delta),
    },
    guides: [
      ...(xSnap ? [{ axis: 'x' as const, coordinateIn: xSnap.targetValue, kind: xSnap.kind }] : []),
      ...(ySnap ? [{ axis: 'y' as const, coordinateIn: ySnap.targetValue, kind: ySnap.kind }] : []),
    ],
  };
}

function alignmentTargetsX(edgeRects: SnapRect[], centerRects: SnapRect[]): SnapAxisCandidate[] {
  return [
    ...edgeRects.flatMap((rect) => [
      { movingValue: 0, targetValue: rect.left, kind: 'edge' as const },
      { movingValue: 0, targetValue: rect.left + rect.widthIn, kind: 'edge' as const },
    ]),
    ...centerRects.map((rect) => ({
      movingValue: 0,
      targetValue: rect.left + rect.widthIn / 2,
      kind: 'center' as const,
    })),
  ];
}

function alignmentTargetsY(edgeRects: SnapRect[], centerRects: SnapRect[]): SnapAxisCandidate[] {
  return [
    ...edgeRects.flatMap((rect) => [
      { movingValue: 0, targetValue: rect.top, kind: 'edge' as const },
      { movingValue: 0, targetValue: rect.top + rect.heightIn, kind: 'edge' as const },
    ]),
    ...centerRects.map((rect) => ({
      movingValue: 0,
      targetValue: rect.top + rect.heightIn / 2,
      kind: 'center' as const,
    })),
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

interface LaneCandidate {
  rect: SnapRect;
  gap: number;
  spanStart: number;
  spanEnd: number;
}

/**
 * Limits alignment candidates to ones with a clear line of sight to the moving
 * rect: a candidate is eligible only if a straight horizontal or vertical line
 * connects it to the moving rect without another candidate's bounding box in the
 * way. A candidate directly left/right must share vertical span with the moving
 * rect; directly above/below must share horizontal span (this determines which
 * "lane" it's in). Within a lane, a candidate is occluded only by another
 * candidate that is both nearer to the moving rect AND whose own perpendicular
 * span overlaps its span — e.g. two pieces side by side in the same row don't
 * block each other's guides just for sharing a lane, since neither actually sits
 * between the other and the mover. Candidates that overlap the moving rect
 * directly (common right as pieces near a snap, and in degenerate/test geometry)
 * always have line of sight, since nothing can sit between two rects that
 * already intersect.
 */
function nearestVisibleRects(rect: SnapRect, candidates: SnapRect[]): SnapRect[] {
  const moving = rectEdges(rect);
  const left: LaneCandidate[] = [];
  const right: LaneCandidate[] = [];
  const above: LaneCandidate[] = [];
  const below: LaneCandidate[] = [];
  const alwaysVisible: SnapRect[] = [];

  for (const candidate of candidates) {
    if (candidate.id === rect.id) {
      continue;
    }
    const edges = rectEdges(candidate);
    const verticalOverlap = edges.top < moving.bottom && edges.bottom > moving.top;
    const horizontalOverlap = edges.left < moving.right && edges.right > moving.left;

    if (verticalOverlap && horizontalOverlap) {
      alwaysVisible.push(candidate);
      continue;
    }

    if (edges.right <= moving.left && verticalOverlap) {
      left.push({ rect: candidate, gap: moving.left - edges.right, spanStart: edges.top, spanEnd: edges.bottom });
    } else if (edges.left >= moving.right && verticalOverlap) {
      right.push({ rect: candidate, gap: edges.left - moving.right, spanStart: edges.top, spanEnd: edges.bottom });
    } else if (edges.bottom <= moving.top && horizontalOverlap) {
      above.push({ rect: candidate, gap: moving.top - edges.bottom, spanStart: edges.left, spanEnd: edges.right });
    } else if (edges.top >= moving.bottom && horizontalOverlap) {
      below.push({ rect: candidate, gap: edges.top - moving.bottom, spanStart: edges.left, spanEnd: edges.right });
    }
    // Neither span overlaps (a purely diagonal candidate) — no line of sight, excluded.
  }

  const visible = new Map<string, SnapRect>();
  for (const candidate of alwaysVisible) {
    visible.set(candidate.id, candidate);
  }
  for (const lane of [left, right, above, below]) {
    for (const candidate of unoccludedInLane(lane)) {
      visible.set(candidate.id, candidate);
    }
  }
  return [...visible.values()];
}

function unoccludedInLane(lane: LaneCandidate[]): SnapRect[] {
  return lane
    .filter(
      (candidate) =>
        !lane.some(
          (other) =>
            other !== candidate &&
            other.gap < candidate.gap &&
            other.spanStart < candidate.spanEnd &&
            other.spanEnd > candidate.spanStart,
        ),
    )
    .map((candidate) => candidate.rect);
}

function closestDelta(
  movingCandidates: Array<Pick<SnapAxisCandidate, 'movingValue' | 'targetValue'>>,
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

function closestAlignmentDelta(
  movingCandidates: SnapAxisCandidate[],
  targets: SnapAxisCandidate[],
  toleranceIn: number,
): { delta: number; distance: number; targetValue: number; kind: 'edge' | 'center' } | undefined {
  let best:
    { delta: number; distance: number; targetValue: number; kind: 'edge' | 'center' } | undefined;

  for (const moving of movingCandidates) {
    for (const target of targets) {
      if (moving.kind !== target.kind) {
        continue;
      }
      const delta = target.targetValue - moving.movingValue;
      const distance = Math.abs(delta);
      const isBetter =
        distance <= toleranceIn &&
        (!best ||
          distance < best.distance ||
          (distance === best.distance && moving.kind === 'edge'));
      if (isBetter) {
        best = { delta, distance, targetValue: target.targetValue, kind: moving.kind };
      }
    }
  }

  return best;
}
