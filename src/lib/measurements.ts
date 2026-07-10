import type {
  ArtPiece,
  MeasurementInstruction,
  MeasurementReference,
  Placement,
  Unit,
  WallSection,
} from '../types';
import { getHookPoints } from './hooks';
import { rectForPlacement, type Rect } from './placement';
import { formatMeasurement } from './units';
import { getSectionById, getSectionOffsetX, getSectionOffsetY } from './wall';

interface PlacedPiece {
  piece: ArtPiece;
  placement: Placement;
  section: WallSection;
  rect: Rect;
  globalLeft: number;
  globalTop: number;
}

export function buildMeasurementInstructions(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
  unit: Unit,
): MeasurementInstruction[] {
  const placed = placements
    .map((placement): PlacedPiece | undefined => {
      const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
      const section = getSectionById(sections, placement.sectionId);
      if (!piece || !section) {
        return undefined;
      }
      return {
        piece,
        placement,
        section,
        rect: rectForPlacement(placement, piece),
        globalLeft: getSectionOffsetX(sections, section.id) + placement.xIn,
        globalTop: getSectionOffsetY(sections, section.id) + placement.yIn,
      };
    })
    .filter((value): value is PlacedPiece => Boolean(value))
    .sort((a, b) => a.globalTop - b.globalTop || a.globalLeft - b.globalLeft);

  return placed.map((item, index) => ({
    order: index + 1,
    pieceId: item.piece.id,
    pieceLabel: item.piece.label,
    sectionName: item.section.name,
    topReference: index === 0 ? wallTopReference(item, unit) : findTopReference(item, placed, unit),
    sideReference:
      index === 0 ? wallLeftReference(item, unit) : findSideReference(item, placed, unit),
    hooks: getHookPoints(item.piece).map((hook) => ({
      ...hook,
      formattedX: formatMeasurement(
        hook.reference === 'right' ? item.piece.widthIn - hook.xIn : hook.xIn,
        unit,
      ),
      formattedY: formatMeasurement(hook.yIn, unit),
    })),
  }));
}

function wallTopReference(item: PlacedPiece, unit: Unit): MeasurementReference {
  return {
    label: `top of ${item.section.name}`,
    distanceIn: item.rect.top,
    formatted: formatMeasurement(item.rect.top, unit),
  };
}

function wallLeftReference(item: PlacedPiece, unit: Unit): MeasurementReference {
  return {
    label: `left side of ${item.section.name}`,
    distanceIn: item.rect.left,
    formatted: formatMeasurement(item.rect.left, unit),
  };
}

function findTopReference(
  item: PlacedPiece,
  placed: PlacedPiece[],
  unit: Unit,
): MeasurementReference {
  const candidates: MeasurementReference[] = [wallTopReference(item, unit)];

  for (const other of placed) {
    if (other.piece.id === item.piece.id || other.section.id !== item.section.id) {
      continue;
    }
    if (
      other.rect.bottom <= item.rect.top &&
      rangesOverlap(other.rect.left, other.rect.right, item.rect.left, item.rect.right)
    ) {
      const distanceIn = item.rect.top - other.rect.bottom;
      candidates.push({
        label: `bottom of ${other.piece.label}`,
        distanceIn,
        formatted: formatMeasurement(distanceIn, unit),
      });
    }
  }

  return candidates.sort((a, b) => a.distanceIn - b.distanceIn)[0];
}

function findSideReference(
  item: PlacedPiece,
  placed: PlacedPiece[],
  unit: Unit,
): MeasurementReference {
  const candidates: MeasurementReference[] = [
    wallLeftReference(item, unit),
    {
      label: `right side of ${item.section.name}`,
      distanceIn: item.section.widthIn - item.rect.right,
      formatted: formatMeasurement(item.section.widthIn - item.rect.right, unit),
    },
  ];

  for (const other of placed) {
    if (other.piece.id === item.piece.id || other.section.id !== item.section.id) {
      continue;
    }
    if (!rangesOverlap(other.rect.top, other.rect.bottom, item.rect.top, item.rect.bottom)) {
      continue;
    }

    if (other.rect.right <= item.rect.left) {
      const distanceIn = item.rect.left - other.rect.right;
      candidates.push({
        label: `right side of ${other.piece.label}`,
        distanceIn,
        formatted: formatMeasurement(distanceIn, unit),
      });
    }
    if (other.rect.left >= item.rect.right) {
      const distanceIn = other.rect.left - item.rect.right;
      candidates.push({
        label: `left side of ${other.piece.label}`,
        distanceIn,
        formatted: formatMeasurement(distanceIn, unit),
      });
    }
  }

  return candidates.sort((a, b) => a.distanceIn - b.distanceIn)[0];
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}
