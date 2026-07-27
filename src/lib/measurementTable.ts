import type { HookMeasurement, MeasurementInstruction } from '../types';

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
    hooks: formatHookSummary(instruction.hooks),
  }));
}

// hooks[].topReference/sideReference are all computed from the same piece
// reference points (see buildMeasurementInstructions), so their labels never
// differ across a piece's own hooks — only the distances can, when a
// two-hook piece has asymmetric side offsets. That lets the top distance be
// stated once instead of once per hook.
export function formatHookSummary(hooks: HookMeasurement[]): string {
  if (hooks.length === 0) {
    return 'No hook data';
  }

  const [first] = hooks;
  const topsMatch = hooks.every(
    (hook) => hook.topReference.formatted === first.topReference.formatted,
  );
  const topPart = topsMatch
    ? `${first.topReference.formatted} from ${first.topReference.label}`
    : hooks
        .map(
          (hook) => `${hook.label}: ${hook.topReference.formatted} from ${hook.topReference.label}`,
        )
        .join('; ');

  const sidePart =
    hooks.length === 1
      ? `${first.sideReference.formatted} from ${first.sideReference.label}`
      : `${hooks.map((hook) => `${hook.label.toLowerCase()} ${hook.sideReference.formatted}`).join(', ')} from ${first.sideReference.label}`;

  return `${topPart}; ${sidePart}`;
}
