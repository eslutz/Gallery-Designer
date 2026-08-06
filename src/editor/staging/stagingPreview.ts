import type { ArtPiece, WallFeature } from '../../types';

const STAGING_SCALE_PX_PER_IN = 4;
const MAX_STAGED_ART_PREVIEW_HEIGHT_PX = 96;

export type StagedItemInput =
  { kind: 'artwork'; artwork: ArtPiece } | { kind: 'feature'; feature: WallFeature };

export function getPreviewBufferGapPx(
  piece: Pick<ArtPiece, 'widthIn' | 'heightIn'>,
  size: { widthPx: number; heightPx: number },
  gapIn: number,
): number {
  if (gapIn <= 0) {
    return 0;
  }

  const scales = [size.widthPx / piece.widthIn, size.heightPx / piece.heightIn].filter(
    (scale) => Number.isFinite(scale) && scale > 0,
  );
  return scales.length > 0 ? Math.min(...scales) * gapIn : 0;
}

export function getStagedItemPreviewSize(item: StagedItemInput) {
  if (item.kind === 'feature') {
    return {
      widthPx: item.feature.widthIn * STAGING_SCALE_PX_PER_IN,
      heightPx: item.feature.heightIn * STAGING_SCALE_PX_PER_IN,
    };
  }

  const piece = item.artwork;
  const rawWidthPx = piece.widthIn * STAGING_SCALE_PX_PER_IN;
  const rawHeightPx = piece.heightIn * STAGING_SCALE_PX_PER_IN;

  if (
    !Number.isFinite(rawWidthPx) ||
    !Number.isFinite(rawHeightPx) ||
    rawWidthPx <= 0 ||
    rawHeightPx <= 0
  ) {
    return { widthPx: 0, heightPx: 0 };
  }

  const scale = Math.min(1, MAX_STAGED_ART_PREVIEW_HEIGHT_PX / rawHeightPx);

  return {
    widthPx: roundPixelValue(rawWidthPx * scale),
    heightPx: roundPixelValue(rawHeightPx * scale),
  };
}

function roundPixelValue(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
