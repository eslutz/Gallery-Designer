import type { ArtPiece, Placement, WallSection } from '../types';
import { isPlacementValid } from './placement';
import { roundToPrecision } from './units';

const TARGET_CENTERLINE_IN = 57;
const TARGET_GAP_IN = 3;
const EDGE_BUFFER_IN = 3;

export type AutoPlacementResult =
  | {
      ok: true;
      layoutKind: 'grid' | 'organic';
      placements: Placement[];
    }
  | {
      ok: false;
      message: string;
    };

export function autoPlacePieces(sections: WallSection[], pieces: ArtPiece[]): AutoPlacementResult {
  if (pieces.length === 0) {
    return { ok: true, layoutKind: 'grid', placements: [] };
  }

  const oversizedPiece = pieces.find(
    (piece) => !sections.some((section) => fitsSection(piece, section)),
  );

  if (oversizedPiece) {
    return { ok: false, message: `${oversizedPiece.label} cannot fit on any wall section.` };
  }

  if (sections.length === 0) {
    return { ok: false, message: 'Add at least one wall section before auto-placing pieces.' };
  }

  if (allSameSize(pieces)) {
    const grid = placeGridAcrossSections(sections, pieces);
    if (grid) {
      return { ok: true, layoutKind: 'grid', placements: grid };
    }
  }

  const organic = placeOrganicAcrossSections(sections, pieces);
  if (organic) {
    return { ok: true, layoutKind: allSameSize(pieces) ? 'grid' : 'organic', placements: organic };
  }

  return {
    ok: false,
    message: 'Could not place every piece on the available wall space without overlaps.',
  };
}

function allSameSize(pieces: ArtPiece[]): boolean {
  const [first] = pieces;
  return pieces.every(
    (piece) => piece.widthIn === first.widthIn && piece.heightIn === first.heightIn,
  );
}

function fitsSection(piece: ArtPiece, section: WallSection): boolean {
  return (
    piece.widthIn + EDGE_BUFFER_IN * 2 <= section.widthIn &&
    piece.heightIn + EDGE_BUFFER_IN * 2 <= section.heightIn
  );
}

function placeGridAcrossSections(
  sections: WallSection[],
  pieces: ArtPiece[],
): Placement[] | undefined {
  const sortedSections = [...sections].sort(
    (a, b) => b.widthIn * b.heightIn - a.widthIn * a.heightIn,
  );
  const placements: Placement[] = [];
  let pieceIndex = 0;

  for (let sectionIndex = 0; sectionIndex < sortedSections.length; sectionIndex += 1) {
    const section = sortedSections[sectionIndex];
    if (pieceIndex >= pieces.length) {
      break;
    }
    const remainingSections = sortedSections.length - sectionIndex;
    const targetCount = Math.ceil((pieces.length - pieceIndex) / remainingSections);
    const remaining = pieces.slice(pieceIndex, pieceIndex + targetCount);
    const sectionPlacements = placeGrid(section, remaining, targetCount);
    if (!sectionPlacements) {
      continue;
    }
    placements.push(...sectionPlacements);
    pieceIndex += sectionPlacements.length;
  }

  return pieceIndex === pieces.length
    ? pieces.map((piece) => placements.find((placement) => placement.pieceId === piece.id)!)
    : undefined;
}

function placeGrid(
  section: WallSection,
  pieces: ArtPiece[],
  targetCount = pieces.length,
): Placement[] | undefined {
  const [piece] = pieces;
  const usableWidth = section.widthIn - EDGE_BUFFER_IN * 2;
  const usableHeight = section.heightIn - EDGE_BUFFER_IN * 2;
  const maxColumns = Math.floor((usableWidth + TARGET_GAP_IN) / (piece.widthIn + TARGET_GAP_IN));
  const candidates: Array<{ columns: number; rows: number; score: number }> = [];
  const maxPieces = Math.min(pieces.length, targetCount);

  for (let count = maxPieces; count >= 1; count -= 1) {
    for (let columns = 1; columns <= Math.max(1, maxColumns); columns += 1) {
      const rows = Math.ceil(count / columns);
      const width = columns * piece.widthIn + (columns - 1) * TARGET_GAP_IN;
      const height = rows * piece.heightIn + (rows - 1) * TARGET_GAP_IN;
      if (width <= usableWidth && height <= usableHeight) {
        candidates.push({
          columns,
          rows,
          score:
            (pieces.length - count) * 10 +
            Math.abs(columns - rows) +
            Math.abs(width / usableWidth - 0.65),
        });
      }
    }
    if (candidates.length > 0) {
      break;
    }
  }

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  if (!best) {
    return undefined;
  }

  const count = Math.min(pieces.length, best.columns * best.rows);
  const groupWidth = best.columns * piece.widthIn + (best.columns - 1) * TARGET_GAP_IN;
  const groupHeight = best.rows * piece.heightIn + (best.rows - 1) * TARGET_GAP_IN;
  const startX = EDGE_BUFFER_IN + (usableWidth - groupWidth) / 2;
  const startY =
    EDGE_BUFFER_IN + clamp(TARGET_CENTERLINE_IN - groupHeight / 2, 0, usableHeight - groupHeight);

  return pieces.slice(0, count).map((current, index) => {
    const column = index % best.columns;
    const row = Math.floor(index / best.columns);
    return {
      pieceId: current.id,
      sectionId: section.id,
      xIn: roundToPrecision(startX + column * (piece.widthIn + TARGET_GAP_IN)),
      yIn: roundToPrecision(startY + row * (piece.heightIn + TARGET_GAP_IN)),
    };
  });
}

function placeOrganicAcrossSections(
  sections: WallSection[],
  pieces: ArtPiece[],
): Placement[] | undefined {
  const sortedPieces = [...pieces].sort((a, b) => b.widthIn * b.heightIn - a.widthIn * a.heightIn);
  const placements: Placement[] = [];

  for (const piece of sortedPieces) {
    const candidate = bestCandidateForPieceAcrossSections(sections, pieces, placements, piece);
    if (!candidate) {
      return undefined;
    }
    placements.push(candidate);
  }

  return pieces.map((piece) => placements.find((placement) => placement.pieceId === piece.id)!);
}

function bestCandidateForPieceAcrossSections(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  piece: ArtPiece,
): Placement | undefined {
  return sections
    .flatMap((section) => {
      const candidate = bestCandidateForPiece(section, sections, pieces, placements, piece);
      return candidate ? [candidate] : [];
    })
    .sort((a, b) => a.score - b.score)[0]?.placement;
}

function bestCandidateForPiece(
  section: WallSection,
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  piece: ArtPiece,
): { placement: Placement; score: number } | undefined {
  const maxX = Math.floor(section.widthIn - piece.widthIn - EDGE_BUFFER_IN);
  const maxY = Math.floor(section.heightIn - piece.heightIn - EDGE_BUFFER_IN);
  let best: { placement: Placement; score: number } | undefined;

  for (let y = EDGE_BUFFER_IN; y <= maxY; y += 1) {
    for (let x = EDGE_BUFFER_IN; x <= maxX; x += 1) {
      const placement = { pieceId: piece.id, sectionId: section.id, xIn: x, yIn: y };
      if (!isPlacementValid(sections, pieces, placements, placement)) {
        continue;
      }

      const score = scorePlacement(section, piece, placement, placements, pieces);
      if (!best || score < best.score) {
        best = { placement, score };
      }
    }
  }

  return best;
}

function scorePlacement(
  section: WallSection,
  piece: ArtPiece,
  placement: Placement,
  placements: Placement[],
  pieces: ArtPiece[],
): number {
  const centerX = placement.xIn + piece.widthIn / 2;
  const centerY = placement.yIn + piece.heightIn / 2;
  const centerlineScore = Math.abs(centerY - TARGET_CENTERLINE_IN);
  const horizontalScore = Math.abs(centerX - section.widthIn / 2) / 2;
  const edgeScore = Math.min(placement.xIn, section.widthIn - (placement.xIn + piece.widthIn)) / 20;

  if (placements.length === 0) {
    return centerlineScore + horizontalScore - edgeScore;
  }

  const nearestGap = Math.min(
    ...placements.map((otherPlacement) => {
      const other = pieces.find((candidate) => candidate.id === otherPlacement.pieceId);
      if (!other) {
        return 99;
      }
      const horizontalGap = Math.max(
        otherPlacement.xIn - (placement.xIn + piece.widthIn),
        placement.xIn - (otherPlacement.xIn + other.widthIn),
        0,
      );
      const verticalGap = Math.max(
        otherPlacement.yIn - (placement.yIn + piece.heightIn),
        placement.yIn - (otherPlacement.yIn + other.heightIn),
        0,
      );
      return Math.max(horizontalGap, verticalGap);
    }),
  );

  return centerlineScore + horizontalScore + Math.abs(nearestGap - TARGET_GAP_IN) * 2 - edgeScore;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
