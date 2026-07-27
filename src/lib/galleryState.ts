import type {
  ArtPiece,
  AutoPlacementSettings,
  EditorFeatures,
  HookSpec,
  Placement,
  ThemeMode,
  Unit,
  WallFeature,
  WallFeatureType,
  WallSection,
} from '../types';
import { resolveApplicationTheme, type ApplicationTheme } from './applicationTheme';
import { resolveDefaultUnit } from './defaultUnit';
import { normalizeWallSections } from './wall';

export const STORAGE_KEY = 'gallery-designer-state-v1';

export type MessageTone = 'info' | 'error';

// Unifies what were three hand-synced primitives (selectedPieceIds,
// selectedFeatureId, and — historically — a piece/feature toggle) into one
// field, so "selecting a piece clears the feature selection" is true by
// construction instead of needing a defensive clear at every write site.
//
// Wall-section selection is deliberately NOT folded in here: it is an
// independent axis today (a section can stay selected while a piece or
// feature is selected/cleared — see App.test.tsx "allows a wall section and
// art piece to be selected at the same time"), so it remains its own
// `useState` in App().
export type Selection =
  | { kind: 'none' }
  | { kind: 'pieces'; pieceIds: string[] }
  | { kind: 'feature'; featureId: string };

export function getSelectedPieceIds(selection: Selection): string[] {
  return selection.kind === 'pieces' ? selection.pieceIds : [];
}

export function getSelectedFeatureId(selection: Selection): string {
  return selection.kind === 'feature' ? selection.featureId : '';
}

// Canonicalizes an empty piece-id list to `{ kind: 'none' }` so callers never
// have to special-case a `'pieces'` selection with zero ids.
export function pieceSelection(pieceIds: string[]): Selection {
  return pieceIds.length > 0 ? { kind: 'pieces', pieceIds } : { kind: 'none' };
}

export interface GalleryState {
  unit: Unit;
  themeMode: ThemeMode;
  applicationTheme: ApplicationTheme;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  autoPlacementSettings: AutoPlacementSettings;
  selection: Selection;
  message: string;
  messageTone: MessageTone;
  messageRevision: number;
}

export function withMessage(current: GalleryState, message: string, tone: MessageTone = 'info') {
  return { message, messageTone: tone, messageRevision: current.messageRevision + 1 };
}

// The wire/persisted shape must not change: `selection` (and the message
// fields, which are write-then-discarded on load anyway) never hit
// localStorage. Only `selectedPieceIds` — projected from `selection` — is
// persisted, matching the format written before this field existed.
export function toPersistedState(state: GalleryState) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude them
  const { selection, message, messageTone, messageRevision, ...rest } = state;
  return { ...rest, selectedPieceIds: getSelectedPieceIds(selection) };
}

export const defaultState: GalleryState = {
  unit: 'in',
  themeMode: 'system',
  applicationTheme: 'slate',
  sections: [
    {
      id: 'section-1',
      name: 'Section 1',
      widthIn: 96,
      heightIn: 84,
      xIn: 0,
      yIn: 0,
    },
  ],
  pieces: [{ id: 'piece-1', label: 'Piece 1', widthIn: 16, heightIn: 20 }],
  placements: [],
  features: {
    snapToGrid: true,
    gridSizeIn: 1,
    snapToAlignment: true,
    showAlignmentGuides: true,
    alignmentToleranceIn: 1,
    wallEdgeBuffer: false,
    wallEdgeBufferGapIn: 2,
    artPieceBuffer: false,
    artPieceBufferGapIn: 2,
    measurementReferenceMode: 'relative',
  },
  autoPlacementSettings: {
    wallSetupMode: 'available-sections',
    context: { kind: 'blank', viewingPosture: 'seated' },
    layoutPreference: 'auto',
    wallFeatures: [],
  },
  selection: { kind: 'pieces', pieceIds: ['piece-1'] },
  message: 'Enter wall and art dimensions, then place pieces on the scaled wall.',
  messageTone: 'info',
  messageRevision: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isHookSpec(value: unknown): value is HookSpec | undefined {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value) || (value.count !== 1 && value.count !== 2)) {
    return false;
  }
  return value.count === 1
    ? isFiniteNumber(value.topOffsetIn) && isFiniteNumber(value.leftOffsetIn)
    : isFiniteNumber(value.leftTopOffsetIn) &&
        isFiniteNumber(value.leftSideOffsetIn) &&
        isFiniteNumber(value.rightTopOffsetIn) &&
        isFiniteNumber(value.rightSideOffsetIn);
}

function isEditorFeatures(value: unknown): value is EditorFeatures {
  return (
    isRecord(value) &&
    typeof value.snapToGrid === 'boolean' &&
    isFiniteNumber(value.gridSizeIn) &&
    typeof value.snapToAlignment === 'boolean' &&
    (value.showAlignmentGuides === undefined || typeof value.showAlignmentGuides === 'boolean') &&
    isFiniteNumber(value.alignmentToleranceIn) &&
    typeof value.wallEdgeBuffer === 'boolean' &&
    isFiniteNumber(value.wallEdgeBufferGapIn) &&
    typeof value.artPieceBuffer === 'boolean' &&
    isFiniteNumber(value.artPieceBufferGapIn) &&
    (value.measurementReferenceMode === undefined ||
      value.measurementReferenceMode === 'relative' ||
      value.measurementReferenceMode === 'absolute')
  );
}

function normalizeEditorFeatures(value: EditorFeatures): EditorFeatures {
  return {
    ...defaultState.features,
    ...value,
    showAlignmentGuides: value.showAlignmentGuides ?? defaultState.features.showAlignmentGuides,
    measurementReferenceMode:
      value.measurementReferenceMode === 'absolute' ? 'absolute' : 'relative',
  };
}

function isAutoPlacementSettings(value: unknown): value is AutoPlacementSettings {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.wallSetupMode !== 'available-sections' &&
    value.wallSetupMode !== 'full-wall-with-features'
  ) {
    return false;
  }
  if (!Array.isArray(value.wallFeatures) || !value.wallFeatures.every(isWallFeature)) {
    return false;
  }
  const layoutPreference = value.layoutPreference;
  if (
    layoutPreference !== 'auto' &&
    layoutPreference !== 'grid' &&
    layoutPreference !== 'row' &&
    layoutPreference !== 'stack' &&
    layoutPreference !== 'salon'
  ) {
    return false;
  }

  const context = value.context;
  if (!isRecord(context)) {
    return false;
  }
  if (context.kind === 'hallway') {
    return true;
  }
  if (context.kind === 'blank') {
    return context.viewingPosture === 'seated' || context.viewingPosture === 'standing';
  }
  return false;
}

function isWallFeature(value: unknown): value is WallFeature {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isWallFeatureType(value.type) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.xIn) &&
    (value.yIn === undefined || isFiniteNumber(value.yIn)) &&
    isFiniteNumber(value.widthIn) &&
    isFiniteNumber(value.heightIn) &&
    (value.placed === undefined || typeof value.placed === 'boolean') &&
    (value.clearanceOverrideIn === undefined || isFiniteNumber(value.clearanceOverrideIn))
  );
}

function isWallFeatureType(value: unknown): value is WallFeatureType {
  return (
    value === 'sofa' ||
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
  );
}

function isPersistedGalleryState(value: unknown): value is Partial<GalleryState> {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !Array.isArray(value.sections) ||
    !Array.isArray(value.pieces) ||
    !Array.isArray(value.placements)
  ) {
    return false;
  }
  if (
    !value.sections.every(
      (section) =>
        isRecord(section) &&
        typeof section.id === 'string' &&
        typeof section.name === 'string' &&
        isFiniteNumber(section.widthIn) &&
        isFiniteNumber(section.heightIn) &&
        (section.xIn === undefined || isFiniteNumber(section.xIn)) &&
        (section.yIn === undefined || isFiniteNumber(section.yIn)),
    )
  ) {
    return false;
  }
  if (
    !value.pieces.every(
      (piece) =>
        isRecord(piece) &&
        typeof piece.id === 'string' &&
        typeof piece.label === 'string' &&
        isFiniteNumber(piece.widthIn) &&
        isFiniteNumber(piece.heightIn) &&
        isHookSpec(piece.hookSpec),
    )
  ) {
    return false;
  }
  return value.placements.every(
    (placement) =>
      isRecord(placement) &&
      typeof placement.pieceId === 'string' &&
      typeof placement.sectionId === 'string' &&
      isFiniteNumber(placement.xIn) &&
      isFiniteNumber(placement.yIn),
  );
}

export function loadState(): GalleryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultState();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedGalleryState(parsed)) {
      return getDefaultState();
    }
    const validPieceIds = new Set(parsed.pieces?.map((piece) => piece.id) ?? []);
    const persistedRecord = parsed as Record<string, unknown>;
    const persistedSelectedPieceIds = Array.isArray(persistedRecord.selectedPieceIds)
      ? [
          ...new Set(
            (persistedRecord.selectedPieceIds as unknown[]).filter(
              (pieceId): pieceId is string =>
                typeof pieceId === 'string' && validPieceIds.has(pieceId),
            ),
          ),
        ]
      : typeof persistedRecord.selectedPieceId === 'string' &&
          validPieceIds.has(persistedRecord.selectedPieceId)
        ? [persistedRecord.selectedPieceId]
        : [];
    return {
      ...defaultState,
      ...parsed,
      themeMode:
        parsed.themeMode === 'light' || parsed.themeMode === 'dark' || parsed.themeMode === 'system'
          ? parsed.themeMode
          : defaultState.themeMode,
      applicationTheme: resolveApplicationTheme(parsed.applicationTheme),
      sections: normalizeWallSections(parsed.sections ?? defaultState.sections),
      unit: parsed.unit === 'cm' ? 'cm' : 'in',
      features: isEditorFeatures(parsed.features)
        ? normalizeEditorFeatures(parsed.features)
        : defaultState.features,
      autoPlacementSettings: isAutoPlacementSettings(parsed.autoPlacementSettings)
        ? parsed.autoPlacementSettings
        : defaultState.autoPlacementSettings,
      selection: pieceSelection(persistedSelectedPieceIds),
      message: defaultState.message,
      messageTone: defaultState.messageTone,
      messageRevision: defaultState.messageRevision,
    };
  } catch {
    return getDefaultState();
  }
}

export function getDefaultState(): GalleryState {
  return {
    ...defaultState,
    unit: resolveDefaultUnit(getBrowserLocaleInput()),
  };
}

export function getBrowserLocaleInput() {
  if (typeof navigator === 'undefined') {
    return {};
  }

  return {
    languages: navigator.languages,
    language: navigator.language,
  };
}
