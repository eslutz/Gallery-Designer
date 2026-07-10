import { describe, expect, it } from 'vitest';
import { getHookPoints } from './hooks';
import type { ArtPiece } from '../types';

describe('hook positioning', () => {
  it('returns a single hook relative to the left side and top edge', () => {
    const piece: ArtPiece = {
      id: 'p',
      label: 'Portrait',
      widthIn: 20,
      heightIn: 24,
      hookSpec: { count: 1, topOffsetIn: 4, leftOffsetIn: 10 },
    };

    expect(getHookPoints(piece)).toEqual([{ label: 'Hook', xIn: 10, yIn: 4, reference: 'left' }]);
  });

  it('returns two hooks with the right hook measured from the right side', () => {
    const piece: ArtPiece = {
      id: 'p',
      label: 'Landscape',
      widthIn: 30,
      heightIn: 20,
      hookSpec: {
        count: 2,
        leftTopOffsetIn: 3,
        leftSideOffsetIn: 5,
        rightTopOffsetIn: 3,
        rightSideOffsetIn: 6,
      },
    };

    expect(getHookPoints(piece)).toEqual([
      { label: 'Left hook', xIn: 5, yIn: 3, reference: 'left' },
      { label: 'Right hook', xIn: 24, yIn: 3, reference: 'right' },
    ]);
  });
});
