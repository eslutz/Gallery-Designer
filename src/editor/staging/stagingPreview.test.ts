import { describe, expect, it } from 'vitest';
import { getPreviewBufferGapPx, getStagedItemPreviewSize } from './stagingPreview';
import type { ArtPiece, WallFeature } from '../../types';

describe('staging preview sizing', () => {
  it('scales a feature preview by the fixed staging scale', () => {
    const feature: WallFeature = {
      id: 'sofa-1',
      type: 'sofa',
      name: 'Sofa',
      xIn: 0,
      widthIn: 20,
      heightIn: 10,
    };
    expect(getStagedItemPreviewSize({ kind: 'feature', feature })).toEqual({
      widthPx: 80,
      heightPx: 40,
    });
  });

  it('scales an artwork preview up to the max preview height, preserving aspect ratio', () => {
    const artwork: ArtPiece = { id: 'p1', label: 'Piece', widthIn: 16, heightIn: 20 };
    // 20in * 4px/in = 80px, under the 96px cap, so no rescale needed.
    expect(getStagedItemPreviewSize({ kind: 'artwork', artwork })).toEqual({
      widthPx: 64,
      heightPx: 80,
    });
  });

  it('shrinks a very tall artwork preview to fit the max height cap', () => {
    const artwork: ArtPiece = { id: 'p1', label: 'Tall', widthIn: 16, heightIn: 200 };
    const size = getStagedItemPreviewSize({ kind: 'artwork', artwork });
    expect(size.heightPx).toBe(96);
    expect(size.widthPx).toBeCloseTo((16 * 4 * 96) / (200 * 4));
  });

  it('returns a zero-size preview for non-finite or non-positive dimensions', () => {
    const artwork: ArtPiece = { id: 'p1', label: 'Bad', widthIn: 0, heightIn: 20 };
    expect(getStagedItemPreviewSize({ kind: 'artwork', artwork })).toEqual({
      widthPx: 0,
      heightPx: 0,
    });
  });

  it('scales the buffer gap by the smaller of the two axis scale factors', () => {
    const piece = { widthIn: 20, heightIn: 10 };
    // width scale: 100/20=5, height scale: 40/10=4 -> use the smaller, 4.
    expect(getPreviewBufferGapPx(piece, { widthPx: 100, heightPx: 40 }, 2)).toBe(8);
  });

  it('returns 0 for a non-positive gap', () => {
    const piece = { widthIn: 20, heightIn: 10 };
    expect(getPreviewBufferGapPx(piece, { widthPx: 100, heightPx: 40 }, 0)).toBe(0);
    expect(getPreviewBufferGapPx(piece, { widthPx: 100, heightPx: 40 }, -2)).toBe(0);
  });

  it('returns 0 when neither axis produces a finite positive scale', () => {
    const piece = { widthIn: 0, heightIn: 0 };
    expect(getPreviewBufferGapPx(piece, { widthPx: 100, heightPx: 40 }, 2)).toBe(0);
  });
});
