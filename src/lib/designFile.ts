import type { ArtPiece, EditorFeatures, Placement, Unit, WallSection } from '../types';
import { normalizeWallSections } from './wall';

export interface DesignFileState {
  unit: Unit;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  selectedPieceId: string;
}

interface DesignFilePayload extends DesignFileState {
  app: 'gallery-designer';
  version: 1;
  exportedAt: string;
}

export function serializeDesignFile(state: DesignFileState): string {
  const payload: DesignFilePayload = {
    app: 'gallery-designer',
    version: 1,
    exportedAt: new Date().toISOString(),
    unit: state.unit,
    sections: normalizeWallSections(state.sections),
    pieces: state.pieces,
    placements: state.placements,
    features: state.features,
    selectedPieceId: state.selectedPieceId,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseDesignFile(raw: string): DesignFileState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Design file is not valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('Design file is not an object.');
  }

  if (!Array.isArray(parsed.sections)) {
    throw new Error('Design file is missing sections.');
  }
  if (!Array.isArray(parsed.pieces)) {
    throw new Error('Design file is missing art pieces.');
  }
  if (!Array.isArray(parsed.placements)) {
    throw new Error('Design file is missing placements.');
  }

  const unit = parsed.unit === 'cm' ? 'cm' : 'in';
  const sections = normalizeWallSections(parsed.sections.map(parseSection));
  const pieces = parsed.pieces.map(parsePiece);
  const placements = parsed.placements.map(parsePlacement).filter((placement) => {
    const hasPiece = pieces.some((piece) => piece.id === placement.pieceId);
    const hasSection = sections.some((section) => section.id === placement.sectionId);
    return hasPiece && hasSection;
  });
  const selectedPieceId =
    typeof parsed.selectedPieceId === 'string' &&
    pieces.some((piece) => piece.id === parsed.selectedPieceId)
      ? parsed.selectedPieceId
      : (pieces[0]?.id ?? '');

  return {
    unit,
    sections,
    pieces,
    placements,
    features: parseFeatures(parsed.features),
    selectedPieceId,
  };
}

function parseSection(value: unknown): WallSection {
  if (!isRecord(value)) {
    throw new Error('Design file includes an invalid wall section.');
  }
  return {
    id: stringValue(value.id, 'section'),
    name: stringValue(value.name, 'Wall section'),
    widthIn: positiveNumber(value.widthIn, 'wall section width'),
    heightIn: positiveNumber(value.heightIn, 'wall section height'),
    cornerAfter:
      value.cornerAfter === 'left' || value.cornerAfter === 'right' ? value.cornerAfter : 'none',
    xIn: finiteNumber(value.xIn, 0),
    yIn: finiteNumber(value.yIn, 0),
  };
}

function parsePiece(value: unknown): ArtPiece {
  if (!isRecord(value)) {
    throw new Error('Design file includes an invalid art piece.');
  }
  const piece: ArtPiece = {
    id: stringValue(value.id, 'piece'),
    label: stringValue(value.label, 'Art piece'),
    widthIn: positiveNumber(value.widthIn, 'piece width'),
    heightIn: positiveNumber(value.heightIn, 'piece height'),
  };
  return isRecord(value.hookSpec)
    ? { ...piece, hookSpec: value.hookSpec as ArtPiece['hookSpec'] }
    : piece;
}

function parsePlacement(value: unknown): Placement {
  if (!isRecord(value)) {
    throw new Error('Design file includes an invalid placement.');
  }
  return {
    pieceId: stringValue(value.pieceId, ''),
    sectionId: stringValue(value.sectionId, ''),
    xIn: finiteNumber(value.xIn, 0),
    yIn: finiteNumber(value.yIn, 0),
  };
}

function parseFeatures(value: unknown): EditorFeatures {
  const parsed = isRecord(value) ? value : {};
  return {
    snapToGrid: typeof parsed.snapToGrid === 'boolean' ? parsed.snapToGrid : true,
    gridSizeIn: Math.max(0.125, finiteNumber(parsed.gridSizeIn, 1)),
    snapToAlignment: typeof parsed.snapToAlignment === 'boolean' ? parsed.snapToAlignment : true,
    alignmentToleranceIn: Math.max(0.125, finiteNumber(parsed.alignmentToleranceIn, 1)),
    wallEdgeBuffer: typeof parsed.wallEdgeBuffer === 'boolean' ? parsed.wallEdgeBuffer : false,
    wallEdgeBufferGapIn: Math.max(0.125, finiteNumber(parsed.wallEdgeBufferGapIn, 2)),
    artPieceBuffer: typeof parsed.artPieceBuffer === 'boolean' ? parsed.artPieceBuffer : false,
    artPieceBufferGapIn: Math.max(0.125, finiteNumber(parsed.artPieceBufferGapIn, 2)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: unknown, label: string): number {
  const parsed = finiteNumber(value, Number.NaN);
  if (parsed <= 0 || !Number.isFinite(parsed)) {
    throw new Error(`Design file includes an invalid ${label}.`);
  }
  return parsed;
}
