import { describe, expect, it } from 'vitest';
import { getWallRemoveControlDimensions } from './wallControl';

describe('getWallRemoveControlDimensions', () => {
  it('converts a fixed pixel target into independent SVG user-space dimensions', () => {
    expect(getWallRemoveControlDimensions({ a: 8, d: 6 }, 24)).toEqual({
      width: 3,
      height: 4,
    });
  });

  it('uses the fallback dimensions when the screen transform is unavailable or invalid', () => {
    expect(getWallRemoveControlDimensions(undefined, 24, 3.6)).toEqual({
      width: 3.6,
      height: 3.6,
    });
    expect(getWallRemoveControlDimensions({ a: 0, d: Number.NaN }, 24, 3.6)).toEqual({
      width: 3.6,
      height: 3.6,
    });
  });
});
