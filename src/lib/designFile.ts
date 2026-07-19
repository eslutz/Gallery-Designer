import type {
  ApplicationTheme,
  ArtPiece,
  AutoPlacementSettings,
  EditorFeatures,
  Placement,
  ThemeMode,
  Unit,
  WallFeature,
  WallFeatureType,
  WallSection,
} from '../types';
import { normalizeWallSections } from './wall';

export interface DesignFileState {
  unit: Unit;
  themeMode: ThemeMode;
  applicationTheme: ApplicationTheme;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  autoPlacementSettings: AutoPlacementSettings;
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
    themeMode: state.themeMode,
    applicationTheme: state.applicationTheme,
    sections: normalizeWallSections(state.sections),
    pieces: state.pieces,
    placements: state.placements,
    features: state.features,
    autoPlacementSettings: state.autoPlacementSettings,
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
  const themeMode = parseThemeMode(parsed.themeMode);
  const applicationTheme = parseApplicationTheme(parsed.applicationTheme);
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
    themeMode,
    applicationTheme,
    sections,
    pieces,
    placements,
    features: parseFeatures(parsed.features),
    autoPlacementSettings: parseAutoPlacementSettings(parsed.autoPlacementSettings),
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
    showAlignmentGuides:
      typeof parsed.showAlignmentGuides === 'boolean' ? parsed.showAlignmentGuides : true,
    alignmentToleranceIn: Math.max(0.125, finiteNumber(parsed.alignmentToleranceIn, 1)),
    wallEdgeBuffer: typeof parsed.wallEdgeBuffer === 'boolean' ? parsed.wallEdgeBuffer : false,
    wallEdgeBufferGapIn: Math.max(0.125, finiteNumber(parsed.wallEdgeBufferGapIn, 2)),
    artPieceBuffer: typeof parsed.artPieceBuffer === 'boolean' ? parsed.artPieceBuffer : false,
    artPieceBufferGapIn: Math.max(0.125, finiteNumber(parsed.artPieceBufferGapIn, 2)),
    measurementReferenceMode:
      parsed.measurementReferenceMode === 'absolute' ? 'absolute' : 'relative',
  };
}

function parseAutoPlacementSettings(value: unknown): AutoPlacementSettings {
  const parsed = isRecord(value) ? value : {};
  return {
    wallSetupMode:
      parsed.wallSetupMode === 'full-wall-with-features'
        ? 'full-wall-with-features'
        : 'available-sections',
    context: parseAutoPlacementContext(parsed.context),
    layoutPreference: parseAutoPlacementLayoutPreference(parsed.layoutPreference),
    wallFeatures: Array.isArray(parsed.wallFeatures)
      ? parsed.wallFeatures.map(parseWallFeature)
      : [],
  };
}

function parseAutoPlacementContext(value: unknown): AutoPlacementSettings['context'] {
  if (!isRecord(value)) {
    return { kind: 'blank', viewingPosture: 'seated' };
  }
  if (value.kind === 'hallway') {
    return { kind: 'hallway' };
  }
  return {
    kind: 'blank',
    viewingPosture: value.viewingPosture === 'standing' ? 'standing' : 'seated',
  };
}

function parseWallFeature(value: unknown): WallFeature {
  const parsed = isRecord(value) ? value : {};
  const feature: WallFeature = {
    id: stringValue(parsed.id, 'feature'),
    type: parseWallFeatureType(parsed.type),
    name: stringValue(parsed.name, 'Wall feature'),
    xIn: Math.max(0, finiteNumber(parsed.xIn, 0)),
    widthIn: positiveNumber(parsed.widthIn, 'wall feature width'),
    heightIn: Math.max(0, finiteNumber(parsed.heightIn, 0)),
  };
  if (Number.isFinite(parsed.yIn)) {
    feature.yIn = Math.max(0, Number(parsed.yIn));
  }
  if (typeof parsed.placed === 'boolean') {
    feature.placed = parsed.placed;
  }
  return Number.isFinite(parsed.clearanceOverrideIn)
    ? { ...feature, clearanceOverrideIn: Math.max(0, Number(parsed.clearanceOverrideIn)) }
    : feature;
}

function parseWallFeatureType(value: unknown): WallFeatureType {
  return value === 'sofa' ||
    value === 'bed' ||
    value === 'console' ||
    value === 'desk' ||
    value === 'file-cabinet' ||
    value === 'lamp' ||
    value === 'bookcase' ||
    value === 'fireplace' ||
    value === 'tv' ||
    value === 'window' ||
    value === 'door' ||
    value === 'custom'
    ? value
    : 'custom';
}

function parseAutoPlacementLayoutPreference(
  value: unknown,
): AutoPlacementSettings['layoutPreference'] {
  return value === 'grid' ||
    value === 'row' ||
    value === 'stack' ||
    value === 'salon' ||
    value === 'auto'
    ? value
    : 'auto';
}

function parseApplicationTheme(value: unknown): ApplicationTheme {
  if (
    value === 'evergreen' ||
    value === 'coastal-blue' ||
    value === 'aubergine' ||
    value === 'terracotta' ||
    value === 'slate'
  ) {
    return value;
  }

  return 'slate';
}

function parseThemeMode(value: unknown): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return 'system';
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
