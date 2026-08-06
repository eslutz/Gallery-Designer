import { describe, expect, it } from 'vitest';
import { getHookPoints, normalizeHookSpec } from './hanging';
import type { ArtPiece } from '../../types';

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

  it('returns two hooks sharing one top offset, with the right hook measured from the right side', () => {
    const piece: ArtPiece = {
      id: 'p',
      label: 'Landscape',
      widthIn: 30,
      heightIn: 20,
      hookSpec: {
        count: 2,
        topOffsetIn: 3,
        leftSideOffsetIn: 5,
        rightSideOffsetIn: 6,
      },
    };

    expect(getHookPoints(piece)).toEqual([
      { label: 'Left hook', xIn: 5, yIn: 3, reference: 'left' },
      { label: 'Right hook', xIn: 24, yIn: 3, reference: 'right' },
    ]);
  });
});

describe('normalizeHookSpec', () => {
  it('returns undefined for a missing or malformed hookSpec', () => {
    expect(normalizeHookSpec(undefined)).toBeUndefined();
    expect(normalizeHookSpec(null)).toBeUndefined();
    expect(normalizeHookSpec({ count: 3 })).toBeUndefined();
    expect(normalizeHookSpec({ count: 1, topOffsetIn: 2 })).toBeUndefined();
  });

  it('passes through a valid single-hook spec', () => {
    expect(normalizeHookSpec({ count: 1, topOffsetIn: 2, leftOffsetIn: 8 })).toEqual({
      count: 1,
      topOffsetIn: 2,
      leftOffsetIn: 8,
    });
  });

  it('passes through a valid two-hook spec already using the shared top offset', () => {
    expect(
      normalizeHookSpec({ count: 2, topOffsetIn: 3, leftSideOffsetIn: 5, rightSideOffsetIn: 6 }),
    ).toEqual({ count: 2, topOffsetIn: 3, leftSideOffsetIn: 5, rightSideOffsetIn: 6 });
  });

  it('migrates a pre-shared-top-offset two-hook spec onto the left top offset', () => {
    expect(
      normalizeHookSpec({
        count: 2,
        leftTopOffsetIn: 4,
        leftSideOffsetIn: 5,
        rightTopOffsetIn: 7,
        rightSideOffsetIn: 6,
      }),
    ).toEqual({ count: 2, topOffsetIn: 4, leftSideOffsetIn: 5, rightSideOffsetIn: 6 });
  });

  it('returns undefined for a two-hook spec missing every top offset', () => {
    expect(
      normalizeHookSpec({ count: 2, leftSideOffsetIn: 5, rightSideOffsetIn: 6 }),
    ).toBeUndefined();
  });
});
