import type { ArtPiece, HookPoint, HookSpec } from '../../types';

export function getHookPoints(piece: ArtPiece): HookPoint[] {
  if (!piece.hookSpec) {
    return [];
  }

  if (piece.hookSpec.count === 1) {
    return [
      {
        label: 'Hook',
        xIn: piece.hookSpec.leftOffsetIn,
        yIn: piece.hookSpec.topOffsetIn,
        reference: 'left',
      },
    ];
  }

  return [
    {
      label: 'Left hook',
      xIn: piece.hookSpec.leftSideOffsetIn,
      yIn: piece.hookSpec.topOffsetIn,
      reference: 'left',
    },
    {
      label: 'Right hook',
      xIn: piece.widthIn - piece.hookSpec.rightSideOffsetIn,
      yIn: piece.hookSpec.topOffsetIn,
      reference: 'right',
    },
  ];
}

/**
 * Normalizes a persisted or imported hookSpec into the current shape.
 * Pre-shared-top-offset designs stored independent leftTopOffsetIn/
 * rightTopOffsetIn (defaulted equal, but not enforced); those migrate onto
 * the new single topOffsetIn using the left value.
 */
export function normalizeHookSpec(value: unknown): HookSpec | undefined {
  if (!isRecord(value) || (value.count !== 1 && value.count !== 2)) {
    return undefined;
  }
  if (value.count === 1) {
    return isFiniteNumber(value.topOffsetIn) && isFiniteNumber(value.leftOffsetIn)
      ? { count: 1, topOffsetIn: value.topOffsetIn, leftOffsetIn: value.leftOffsetIn }
      : undefined;
  }
  if (!isFiniteNumber(value.leftSideOffsetIn) || !isFiniteNumber(value.rightSideOffsetIn)) {
    return undefined;
  }
  const topOffsetIn = isFiniteNumber(value.topOffsetIn)
    ? value.topOffsetIn
    : isFiniteNumber(value.leftTopOffsetIn)
      ? value.leftTopOffsetIn
      : undefined;
  return topOffsetIn === undefined
    ? undefined
    : {
        count: 2,
        topOffsetIn,
        leftSideOffsetIn: value.leftSideOffsetIn,
        rightSideOffsetIn: value.rightSideOffsetIn,
      };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
