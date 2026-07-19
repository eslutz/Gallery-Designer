export type Unit = 'in' | 'cm';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ApplicationTheme = 'evergreen' | 'coastal-blue' | 'aubergine' | 'terracotta' | 'slate';

export type CornerDirection = 'none' | 'left' | 'right';

export interface WallSection {
  id: string;
  name: string;
  widthIn: number;
  heightIn: number;
  cornerAfter: CornerDirection;
  xIn?: number;
  yIn?: number;
}

export type HookSpec =
  | {
      count: 1;
      topOffsetIn: number;
      leftOffsetIn: number;
    }
  | {
      count: 2;
      leftTopOffsetIn: number;
      leftSideOffsetIn: number;
      rightTopOffsetIn: number;
      rightSideOffsetIn: number;
    };

export interface ArtPiece {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  hookSpec?: HookSpec;
}

export interface Placement {
  pieceId: string;
  sectionId: string;
  xIn: number;
  yIn: number;
}

export type MeasurementReferenceMode = 'relative' | 'absolute';

export interface EditorFeatures {
  snapToGrid: boolean;
  gridSizeIn: number;
  snapToAlignment: boolean;
  showAlignmentGuides: boolean;
  alignmentToleranceIn: number;
  wallEdgeBuffer: boolean;
  wallEdgeBufferGapIn: number;
  artPieceBuffer: boolean;
  artPieceBufferGapIn: number;
  measurementReferenceMode: MeasurementReferenceMode;
}

export type AutoPlacementContext =
  | {
      kind: 'blank';
      viewingPosture: 'seated' | 'standing';
    }
  | {
      kind: 'hallway';
    };

export type AutoPlacementLayoutPreference = 'auto' | 'grid' | 'row' | 'stack' | 'salon';

export type WallSetupMode = 'available-sections' | 'full-wall-with-features';

export type WallFeatureType =
  | 'sofa'
  | 'bed'
  | 'console'
  | 'desk'
  | 'file-cabinet'
  | 'lamp'
  | 'bookcase'
  | 'fireplace'
  | 'tv'
  | 'window'
  | 'door'
  | 'custom';

export interface WallFeature {
  id: string;
  type: WallFeatureType;
  name: string;
  xIn: number;
  yIn?: number;
  widthIn: number;
  heightIn: number;
  placed?: boolean;
  clearanceOverrideIn?: number;
}

export interface AutoPlacementSettings {
  wallSetupMode: WallSetupMode;
  context: AutoPlacementContext;
  layoutPreference: AutoPlacementLayoutPreference;
  wallFeatures: WallFeature[];
}

export interface WallSectionLayout {
  section: WallSection;
  offsetXIn: number;
  offsetYIn: number;
}

export interface MeasurementReference {
  label: string;
  distanceIn: number;
  formatted: string;
}

export interface PieceDimensions {
  widthIn: number;
  heightIn: number;
  formatted: string;
}

export interface HookPoint {
  label: string;
  xIn: number;
  yIn: number;
  reference: 'left' | 'right';
}

export interface HookMeasurement extends HookPoint {
  formattedX: string;
  formattedY: string;
}

export interface MeasurementInstruction {
  order: number;
  pieceId: string;
  pieceLabel: string;
  sectionName: string;
  pieceDimensions: PieceDimensions;
  topReference: MeasurementReference;
  sideReference: MeasurementReference;
  hooks: HookMeasurement[];
}
