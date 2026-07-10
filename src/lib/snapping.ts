import type { ArtPiece, EditorFeatures, Placement, WallSection } from '../types';
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
}

interface SnapAxisCandidate {
  movingValue: number;
  targetValue: number;
}

interface AxisTargets {
  x: number[];
  y: number[];
}

export function applyPlacementFeatures({
  placement,
  piece,
  sections,
  pieces,
  placements,
  features,
}: SnapInput): Placement {
  let next = placement;

  if (features.snapToGrid && features.gridSizeIn > 0) {
    next = {
      ...next,
      xIn: roundToPrecision(next.xIn, features.gridSizeIn),
      yIn: roundToPrecision(next.yIn, features.gridSizeIn),
    };
  }

  const bufferTolerance = Math.max(0.125, features.alignmentToleranceIn);

  if (features.wallEdgeBuffer && features.wallEdgeBufferGapIn > 0) {
    next = snapToTargets(
      next,
      piece,
      sections,
      wallEdgeBufferTargets(sections, features.wallEdgeBufferGapIn),
      bufferTolerance,
    );
  }

  if (features.artPieceBuffer && features.artPieceBufferGapIn > 0) {
    next = snapToTargets(
      next,
      piece,
      sections,
      artPieceBufferTargets(
        sections,
        pieces,
        placements,
        placement.pieceId,
        features.artPieceBufferGapIn,
      ),
      bufferTolerance,
    );
  }

  if (!features.snapToAlignment || features.alignmentToleranceIn <= 0) {
    return next;
  }

  return snapToAlignment(next, piece, sections, pieces, placements, features.alignmentToleranceIn);
}

function snapToTargets(
  placement: Placement,
  piece: ArtPiece,
  sections: WallSection[],
  targets: AxisTargets,
  toleranceIn: number,
): Placement {
  const offsetX = getSectionOffsetX(sections, placement.sectionId);
  const offsetY = getSectionOffsetY(sections, placement.sectionId);
  const moving = globalRectForPlacement(sections, placement, piece);
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
    ...placement,
    xIn: xDelta === undefined ? placement.xIn : roundToPrecision(moving.left + xDelta - offsetX),
    yIn: yDelta === undefined ? placement.yIn : roundToPrecision(moving.top + yDelta - offsetY),
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

function artPieceBufferTargets(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  movingPieceId: string,
  gapIn: number,
): AxisTargets {
  const targets: AxisTargets = { x: [], y: [] };

  for (const placement of placements) {
    if (placement.pieceId === movingPieceId) {
      continue;
    }
    const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
    if (!piece) {
      continue;
    }
    const rect = globalRectForPlacement(sections, placement, piece);
    targets.x.push(rect.left - gapIn, rect.right + gapIn);
    targets.y.push(rect.top - gapIn, rect.bottom + gapIn);
  }

  return targets;
}

function snapToAlignment(
  placement: Placement,
  piece: ArtPiece,
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  toleranceIn: number,
): Placement {
  const offsetX = getSectionOffsetX(sections, placement.sectionId);
  const offsetY = getSectionOffsetY(sections, placement.sectionId);
  const moving = globalRectForPlacement(sections, placement, piece);
  const targetX = alignmentTargetsX(sections, pieces, placements, placement.pieceId);
  const targetY = alignmentTargetsY(sections, pieces, placements, placement.pieceId);

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
    ...placement,
    xIn: xDelta === undefined ? placement.xIn : roundToPrecision(moving.left + xDelta - offsetX),
    yIn: yDelta === undefined ? placement.yIn : roundToPrecision(moving.top + yDelta - offsetY),
  };
}

function alignmentTargetsX(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  movingPieceId: string,
): number[] {
  const bounds = getWallBounds(sections);
  return [
    bounds.minX,
    bounds.maxX,
    (bounds.minX + bounds.maxX) / 2,
    ...placements.flatMap((placement) => {
      if (placement.pieceId === movingPieceId) {
        return [];
      }
      const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
      if (!piece) {
        return [];
      }
      const rect = globalRectForPlacement(sections, placement, piece);
      return [rect.left, rect.right, (rect.left + rect.right) / 2];
    }),
  ];
}

function alignmentTargetsY(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  movingPieceId: string,
): number[] {
  const bounds = getWallBounds(sections);
  return [
    bounds.minY,
    bounds.maxY,
    (bounds.minY + bounds.maxY) / 2,
    ...placements.flatMap((placement) => {
      if (placement.pieceId === movingPieceId) {
        return [];
      }
      const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
      if (!piece) {
        return [];
      }
      const rect = globalRectForPlacement(sections, placement, piece);
      return [rect.top, rect.bottom, (rect.top + rect.bottom) / 2];
    }),
  ];
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
