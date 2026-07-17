import type { MeasurementInstruction } from '../types';

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
  hooks: string;
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
    hooks:
      instruction.hooks.length === 0
        ? 'No hook data'
        : instruction.hooks
            .map(
              (hook) =>
                `${hook.label}: ${hook.formattedY} down, ${hook.formattedX} from ${hook.reference}`,
            )
            .join('; '),
  }));
}
