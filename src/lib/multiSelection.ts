import type { ArtPiece, Placement, WallSection } from '../types';
import {
  globalRectForPlacement,
  reassignPlacementToContainingSection,
  type Rect,
} from './placement';
import { roundToPrecision } from './units';
import { getSectionOffsetX, getSectionOffsetY } from './wall';

export interface SelectionPoint {
  x: number;
  y: number;
}

export function normalizeSelectionRect(start: SelectionPoint, end: SelectionPoint): Rect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

export function getPieceIdsIntersectingRect(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  selectionRect: Rect,
): string[] {
  const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));
  return placements.flatMap((placement) => {
    const piece = piecesById.get(placement.pieceId);
    if (!piece) {
      return [];
    }
    return rectsHavePositiveAreaOverlap(
      globalRectForPlacement(sections, placement, piece),
      selectionRect,
    )
      ? [placement.pieceId]
      : [];
  });
}

export function getGroupBounds(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  pieceIds: Iterable<string>,
): Rect | null {
  const selectedIds = new Set(pieceIds);
  const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));
  const rects = placements.flatMap((placement) => {
    const piece = piecesById.get(placement.pieceId);
    return piece && selectedIds.has(placement.pieceId)
      ? [globalRectForPlacement(sections, placement, piece)]
      : [];
  });
  if (rects.length === 0) {
    return null;
  }
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

export function translatePlacementGroup(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  pieceIds: Iterable<string>,
  deltaXIn: number,
  deltaYIn: number,
): Placement[] {
  const selectedIds = new Set(pieceIds);
  const piecesById = new Map(pieces.map((piece) => [piece.id, piece]));
  return placements.flatMap((placement) => {
    if (!selectedIds.has(placement.pieceId)) {
      return [];
    }
    const piece = piecesById.get(placement.pieceId);
    if (!piece) {
      return [];
    }
    const proposed = {
      ...placement,
      xIn: roundToPrecision(
        getSectionOffsetX(sections, placement.sectionId) + placement.xIn + deltaXIn,
      ),
      yIn: roundToPrecision(
        getSectionOffsetY(sections, placement.sectionId) + placement.yIn + deltaYIn,
      ),
    };
    const localToOriginalSection = {
      ...proposed,
      xIn: roundToPrecision(proposed.xIn - getSectionOffsetX(sections, placement.sectionId)),
      yIn: roundToPrecision(proposed.yIn - getSectionOffsetY(sections, placement.sectionId)),
    };
    return [reassignPlacementToContainingSection(sections, localToOriginalSection, piece)];
  });
}

function rectsHavePositiveAreaOverlap(first: Rect, second: Rect): boolean {
  return (
    Math.min(first.right, second.right) > Math.max(first.left, second.left) &&
    Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top)
  );
}
