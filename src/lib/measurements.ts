import type {
  ArtPiece,
  MeasurementInstruction,
  MeasurementReferenceMode,
  MeasurementReference,
  Placement,
  SideMeasurementReference,
  Unit,
  WallSection,
} from '../types';
import { getHookPoints } from './hooks';
import { rectForPlacement, type Rect } from './placement';
import { formatMeasurement } from './units';
import { getSectionById, getSectionOffsetX, getSectionOffsetY, getWallBounds } from './wall';

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
  referenceMode: MeasurementReferenceMode = 'relative',
): MeasurementInstruction[] {
  const bounds = getWallBounds(sections);
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

  return placed.map((item, index) => {
    const topReference =
      referenceMode === 'absolute'
        ? absoluteTopReference(item, bounds.minY, unit)
        : index === 0
          ? wallTopReference(item, unit)
          : findTopReference(item, placed, unit);
    const sideReference =
      referenceMode === 'absolute'
        ? absoluteSideReference(item, bounds.minX, unit)
        : index === 0
          ? wallLeftReference(item, unit)
          : findSideReference(item, placed, unit);

    return {
      order: index + 1,
      pieceId: item.piece.id,
      pieceLabel: item.piece.label,
      sectionName: item.section.name,
      pieceDimensions: {
        widthIn: item.piece.widthIn,
        heightIn: item.piece.heightIn,
        formatted: `${formatMeasurement(item.piece.widthIn, unit)} x ${formatMeasurement(item.piece.heightIn, unit)}`,
      },
      topReference,
      sideReference,
      // Anchored to the same wall/section reference points as the piece's
      // own placement above, not to the piece's frame — an installer marking
      // hook positions shouldn't have to add the frame offset by hand.
      hooks: getHookPoints(item.piece).map((hook) => {
        const topDistanceIn = topReference.distanceIn + hook.yIn;
        const sideDistanceIn =
          sideReference.anchor === 'right'
            ? sideReference.distanceIn + (item.piece.widthIn - hook.xIn)
            : sideReference.distanceIn + hook.xIn;
        return {
          label: hook.label,
          topReference: {
            label: topReference.label,
            distanceIn: topDistanceIn,
            formatted: formatMeasurement(topDistanceIn, unit),
          },
          sideReference: {
            label: sideReference.label,
            distanceIn: sideDistanceIn,
            formatted: formatMeasurement(sideDistanceIn, unit),
          },
        };
      }),
    };
  });
}

function absoluteTopReference(
  item: PlacedPiece,
  wallOriginYIn: number,
  unit: Unit,
): MeasurementReference {
  const distanceIn = item.globalTop - wallOriginYIn;
  return {
    label: 'top-left wall origin',
    distanceIn,
    formatted: formatMeasurement(distanceIn, unit),
  };
}

function absoluteSideReference(
  item: PlacedPiece,
  wallOriginXIn: number,
  unit: Unit,
): SideMeasurementReference {
  const distanceIn = item.globalLeft - wallOriginXIn;
  return {
    label: 'top-left wall origin',
    distanceIn,
    formatted: formatMeasurement(distanceIn, unit),
    anchor: 'left',
  };
}

function wallTopReference(item: PlacedPiece, unit: Unit): MeasurementReference {
  return {
    label: `top of ${item.section.name}`,
    distanceIn: item.rect.top,
    formatted: formatMeasurement(item.rect.top, unit),
  };
}

function wallLeftReference(item: PlacedPiece, unit: Unit): SideMeasurementReference {
  return {
    label: `left side of ${item.section.name}`,
    distanceIn: item.rect.left,
    formatted: formatMeasurement(item.rect.left, unit),
    anchor: 'left',
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
): SideMeasurementReference {
  const candidates: SideMeasurementReference[] = [
    wallLeftReference(item, unit),
    {
      label: `right side of ${item.section.name}`,
      distanceIn: item.section.widthIn - item.rect.right,
      formatted: formatMeasurement(item.section.widthIn - item.rect.right, unit),
      anchor: 'right',
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
      // `other` sits to the left of `item`, so distance from its right edge
      // grows the same direction as distance from the section's left edge.
      const distanceIn = item.rect.left - other.rect.right;
      candidates.push({
        label: `right side of ${other.piece.label}`,
        distanceIn,
        formatted: formatMeasurement(distanceIn, unit),
        anchor: 'left',
      });
    }
    if (other.rect.left >= item.rect.right) {
      // `other` sits to the right of `item`, so distance from its left edge
      // grows the same direction as distance from the section's right edge.
      const distanceIn = other.rect.left - item.rect.right;
      candidates.push({
        label: `left side of ${other.piece.label}`,
        distanceIn,
        formatted: formatMeasurement(distanceIn, unit),
        anchor: 'right',
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
