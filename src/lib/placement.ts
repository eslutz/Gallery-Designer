import type { ArtPiece, Placement, WallSection } from '../types';
import { getSectionById, getSectionOffsetX, getSectionOffsetY, getWallBounds } from './wall';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function rectForPlacement(placement: Placement, piece: ArtPiece): Rect {
  return {
    left: placement.xIn,
    top: placement.yIn,
    right: placement.xIn + piece.widthIn,
    bottom: placement.yIn + piece.heightIn,
  };
}

export function globalRectForPlacement(
  sections: WallSection[],
  placement: Placement,
  piece: ArtPiece,
): Rect {
  const offsetX = getSectionOffsetX(sections, placement.sectionId);
  const offsetY = getSectionOffsetY(sections, placement.sectionId);
  return {
    left: offsetX + placement.xIn,
    top: offsetY + placement.yIn,
    right: offsetX + placement.xIn + piece.widthIn,
    bottom: offsetY + placement.yIn + piece.heightIn,
  };
}

export function placementsOverlapOrTouch(
  firstPlacement: Placement,
  firstPiece: ArtPiece,
  secondPlacement: Placement,
  secondPiece: ArtPiece,
): boolean {
  if (firstPlacement.sectionId !== secondPlacement.sectionId) {
    return false;
  }

  const first = rectForPlacement(firstPlacement, firstPiece);
  const second = rectForPlacement(secondPlacement, secondPiece);

  return !(
    first.right < second.left ||
    second.right < first.left ||
    first.bottom < second.top ||
    second.bottom < first.top
  );
}

export function clampPlacement(
  placement: Placement,
  piece: ArtPiece,
  section: WallSection,
): Placement {
  return {
    ...placement,
    xIn: clamp(placement.xIn, 0, Math.max(0, section.widthIn - piece.widthIn)),
    yIn: clamp(placement.yIn, 0, Math.max(0, section.heightIn - piece.heightIn)),
  };
}

export function clampPlacementToWall(
  sections: WallSection[],
  placement: Placement,
  piece: ArtPiece,
): Placement {
  const bounds = getWallBounds(sections);
  const offsetX = getSectionOffsetX(sections, placement.sectionId);
  const offsetY = getSectionOffsetY(sections, placement.sectionId);
  return {
    ...placement,
    xIn: clamp(placement.xIn, bounds.minX - offsetX, bounds.maxX - offsetX - piece.widthIn),
    yIn: clamp(placement.yIn, bounds.minY - offsetY, bounds.maxY - offsetY - piece.heightIn),
  };
}

export function reassignPlacementToContainingSection(
  sections: WallSection[],
  placement: Placement,
  piece: ArtPiece,
): Placement {
  const globalRect = globalRectForPlacement(sections, placement, piece);
  let bestSection: WallSection | null = null;
  let bestOverlapArea = 0;

  for (const section of sections) {
    const sectionLeft = getSectionOffsetX(sections, section.id);
    const sectionTop = getSectionOffsetY(sections, section.id);
    const sectionRect: Rect = {
      left: sectionLeft,
      top: sectionTop,
      right: sectionLeft + section.widthIn,
      bottom: sectionTop + section.heightIn,
    };
    const overlapArea = rectOverlapArea(globalRect, sectionRect);
    if (overlapArea > bestOverlapArea) {
      bestSection = section;
      bestOverlapArea = overlapArea;
    }
  }

  if (!bestSection || bestSection.id === placement.sectionId) {
    return placement;
  }

  return {
    ...placement,
    sectionId: bestSection.id,
    xIn: globalRect.left - getSectionOffsetX(sections, bestSection.id),
    yIn: globalRect.top - getSectionOffsetY(sections, bestSection.id),
  };
}

export function reassignPlacementsToContainingSections(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
): Placement[] {
  return placements.map((placement) => {
    const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
    return piece ? reassignPlacementToContainingSection(sections, placement, piece) : placement;
  });
}

export function isPlacementWithinWall(
  sections: WallSection[],
  placement: Placement,
  piece: ArtPiece,
): boolean {
  return rectIsCoveredBySections(globalRectForPlacement(sections, placement, piece), sections);
}

export function getPlacementIssues(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
): string[] {
  return getAutoPlacementIssues(sections, pieces, placements);
}

export function getAutoPlacementIssues(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
): string[] {
  const issues: string[] = [];

  for (const placement of placements) {
    const section = getSectionById(sections, placement.sectionId);
    const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
    if (!section || !piece) {
      continue;
    }

    if (!isPlacementWithinWall(sections, placement, piece)) {
      issues.push(`${piece.label} extends beyond the wall boundary.`);
    }
  }

  for (let i = 0; i < placements.length; i += 1) {
    const firstPlacement = placements[i];
    const firstPiece = pieces.find((piece) => piece.id === firstPlacement.pieceId);
    if (!firstPiece) {
      continue;
    }

    for (let j = i + 1; j < placements.length; j += 1) {
      const secondPlacement = placements[j];
      const secondPiece = pieces.find((piece) => piece.id === secondPlacement.pieceId);
      if (!secondPiece) {
        continue;
      }

      if (
        rectsOverlapOrTouch(
          globalRectForPlacement(sections, firstPlacement, firstPiece),
          globalRectForPlacement(sections, secondPlacement, secondPiece),
        )
      ) {
        issues.push(`${firstPiece.label} touches or overlaps ${secondPiece.label}.`);
      }
    }
  }

  return issues;
}

export function rectIsCoveredBySections(rect: Rect, sections: WallSection[]): boolean {
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    return false;
  }

  const xStops = [
    rect.left,
    rect.right,
    ...sections.flatMap((section) => {
      const left = getSectionOffsetX(sections, section.id);
      return [left, left + section.widthIn];
    }),
  ]
    .filter((x) => x >= rect.left && x <= rect.right)
    .sort((a, b) => a - b);
  const yStops = [
    rect.top,
    rect.bottom,
    ...sections.flatMap((section) => {
      const top = getSectionOffsetY(sections, section.id);
      return [top, top + section.heightIn];
    }),
  ]
    .filter((y) => y >= rect.top && y <= rect.bottom)
    .sort((a, b) => a - b);

  for (let xIndex = 0; xIndex < xStops.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < yStops.length - 1; yIndex += 1) {
      const left = xStops[xIndex];
      const right = xStops[xIndex + 1];
      const top = yStops[yIndex];
      const bottom = yStops[yIndex + 1];
      if (right === left || bottom === top) {
        continue;
      }

      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      if (!sections.some((section) => pointIsInSection(sections, section, centerX, centerY))) {
        return false;
      }
    }
  }

  return true;
}

function pointIsInSection(
  sections: WallSection[],
  section: WallSection,
  xIn: number,
  yIn: number,
): boolean {
  const left = getSectionOffsetX(sections, section.id);
  const top = getSectionOffsetY(sections, section.id);
  return (
    xIn >= left && xIn <= left + section.widthIn && yIn >= top && yIn <= top + section.heightIn
  );
}

function rectsOverlapOrTouch(first: Rect, second: Rect): boolean {
  return !(
    first.right < second.left ||
    second.right < first.left ||
    first.bottom < second.top ||
    second.bottom < first.top
  );
}

function rectOverlapArea(first: Rect, second: Rect): number {
  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return width > 0 && height > 0 ? width * height : 0;
}

export function isPlacementValid(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  proposed: Placement,
): boolean {
  const nextPlacements = [
    ...placements.filter((placement) => placement.pieceId !== proposed.pieceId),
    proposed,
  ];
  return getAutoPlacementIssues(sections, pieces, nextPlacements).length === 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
