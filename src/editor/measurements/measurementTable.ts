import type { HookMeasurement, MeasurementInstruction } from '../../types';

export const MEASUREMENT_TABLE_HEADERS = [
  'Order',
  'Piece / section',
  'Place the piece',
  'Hooks',
] as const;

export const EXPORT_MEASUREMENT_TABLE_HEADERS = [
  'Order',
  'Piece / section',
  'Dimensions',
  'Place the piece',
  'Hooks',
] as const;

export interface MeasurementTableRow {
  order: number;
  pieceLabel: string;
  sectionName: string;
  dimensions?: string;
  topReference: string;
  sideReference: string;
  hooks: string[];
}

interface MeasurementTableOptions {
  includeDimensions?: boolean;
}

export function buildMeasurementTableRows(
  instructions: MeasurementInstruction[],
  options: MeasurementTableOptions = {},
): MeasurementTableRow[] {
  return instructions.map((instruction) => ({
    order: instruction.order,
    pieceLabel: instruction.pieceLabel,
    sectionName: instruction.sectionName,
    ...(options.includeDimensions ? { dimensions: instruction.pieceDimensions.formatted } : {}),
    topReference: `${instruction.topReference.formatted} from ${instruction.topReference.label}`,
    sideReference: `${instruction.sideReference.formatted} from ${instruction.sideReference.label}`,
    hooks: formatHookLines(instruction.hooks),
  }));
}

// One line per hook, e.g. "5 in down, 12 in from left" — the caller adds its
// own "Hook 1:"/"Hook 2:" numbering, the same way "Top:"/"Side:" labels are
// added at each render site rather than baked in here.
export function formatHookLines(hooks: HookMeasurement[]): string[] {
  return hooks.map((hook) => `${hook.topFormatted} down, ${hook.sideFormatted} from left`);
}
