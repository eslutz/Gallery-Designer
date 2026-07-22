export interface WallRemoveControlDimensions {
  width: number;
  height: number;
}

export function getWallRemoveControlDimensions(
  screenTransform: Pick<DOMMatrix, 'a' | 'd'> | null | undefined,
  targetSizePx: number,
  fallbackSizeIn: number,
): WallRemoveControlDimensions {
  const scaleX = Math.abs(screenTransform?.a ?? Number.NaN);
  const scaleY = Math.abs(screenTransform?.d ?? Number.NaN);

  if (
    !Number.isFinite(targetSizePx) ||
    targetSizePx <= 0 ||
    !Number.isFinite(scaleX) ||
    scaleX <= 0 ||
    !Number.isFinite(scaleY) ||
    scaleY <= 0
  ) {
    return { width: fallbackSizeIn, height: fallbackSizeIn };
  }

  return {
    width: targetSizePx / scaleX,
    height: targetSizePx / scaleY,
  };
}
