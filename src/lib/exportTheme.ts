import { DEFAULT_APPLICATION_THEME, type ApplicationTheme } from './applicationTheme';

export interface ExportPalette {
  textPrimary: string;
  textSecondary: string;
  panelBackground: string;
  panelBorder: string;
  sectionFill: string;
  wallEdge: string;
  pieceFill: string;
  pieceStroke: string;
  hookFill: string;
  hookStroke: string;
  featureBlockedFill: string;
  featureFill: string;
  featureStroke: string;
  headerFill: string;
  headerText: string;
  rowFillA: string;
  rowFillB: string;
  tableBorder: string;
}

// Light-mode swatches for each application palette, mirrored from the
// :root[data-palette='X'] blocks in styles.css so the export matches what
// the user sees in the app regardless of which theme (or dark mode) is active.
const EXPORT_PALETTES: Record<ApplicationTheme, ExportPalette> = {
  evergreen: {
    textPrimary: '#15211a',
    textSecondary: '#526257',
    panelBackground: '#f8faf7',
    panelBorder: '#d8e1da',
    sectionFill: '#edf5ef',
    wallEdge: '#789583',
    pieceFill: '#dbece2',
    pieceStroke: '#2b3a30',
    hookFill: '#ffffff',
    hookStroke: '#15211a',
    featureBlockedFill: '#d8e1da',
    featureFill: '#a9c2b1',
    featureStroke: '#789583',
    headerFill: '#245b46',
    headerText: '#ffffff',
    rowFillA: '#fbfcfa',
    rowFillB: '#edf5ef',
    tableBorder: '#dfe8e1',
  },
  'coastal-blue': {
    textPrimary: '#13202d',
    textSecondary: '#506678',
    panelBackground: '#f8fafc',
    panelBorder: '#d7e2ef',
    sectionFill: '#edf4fb',
    wallEdge: '#7f9fbe',
    pieceFill: '#dbeaf8',
    pieceStroke: '#295d8b',
    hookFill: '#ffffff',
    hookStroke: '#13202d',
    featureBlockedFill: '#d7e2ef',
    featureFill: '#a8c1da',
    featureStroke: '#7f9fbe',
    headerFill: '#2d6ea8',
    headerText: '#ffffff',
    rowFillA: '#fdfeff',
    rowFillB: '#edf4fb',
    tableBorder: '#dbe5f0',
  },
  aubergine: {
    textPrimary: '#23172e',
    textSecondary: '#5d4d67',
    panelBackground: '#fbf9fc',
    panelBorder: '#e2d8ea',
    sectionFill: '#f2ecf7',
    wallEdge: '#9b83b3',
    pieceFill: '#ead8ef',
    pieceStroke: '#6a3e78',
    hookFill: '#ffffff',
    hookStroke: '#23172e',
    featureBlockedFill: '#e2d8ea',
    featureFill: '#c3aad2',
    featureStroke: '#9b83b3',
    headerFill: '#7b4a9f',
    headerText: '#ffffff',
    rowFillA: '#fffeff',
    rowFillB: '#f2ecf7',
    tableBorder: '#e3d9eb',
  },
  terracotta: {
    textPrimary: '#2b1b16',
    textSecondary: '#66534a',
    panelBackground: '#fcfbf9',
    panelBorder: '#eadfd6',
    sectionFill: '#fbf0ea',
    wallEdge: '#ba8b71',
    pieceFill: '#f7dbc9',
    pieceStroke: '#b45a3f',
    hookFill: '#ffffff',
    hookStroke: '#2b1b16',
    featureBlockedFill: '#eadfd6',
    featureFill: '#dab89e',
    featureStroke: '#ba8b71',
    headerFill: '#b45f39',
    headerText: '#ffffff',
    rowFillA: '#fffdfb',
    rowFillB: '#fbf0ea',
    tableBorder: '#eadfd6',
  },
  slate: {
    textPrimary: '#1b232b',
    textSecondary: '#566472',
    panelBackground: '#f8fafc',
    panelBorder: '#d7dee7',
    sectionFill: '#edf2f6',
    wallEdge: '#8a99a8',
    pieceFill: '#dfe7f0',
    pieceStroke: '#4b647b',
    hookFill: '#ffffff',
    hookStroke: '#1b232b',
    featureBlockedFill: '#d7dee7',
    featureFill: '#aebccb',
    featureStroke: '#8a99a8',
    headerFill: '#344454',
    headerText: '#ffffff',
    rowFillA: '#fcfdfe',
    rowFillB: '#edf2f6',
    tableBorder: '#dbe3ea',
  },
};

export function getExportPalette(theme: ApplicationTheme | undefined): ExportPalette {
  return EXPORT_PALETTES[theme ?? DEFAULT_APPLICATION_THEME];
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
