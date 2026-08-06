import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MOVE_TOLERANCE_PX, pressMovedTooFar, requiresLongPress } from './longPressDrag';

describe('requiresLongPress', () => {
  it('holds only touch, since only touch competes with scrolling', () => {
    expect(requiresLongPress('touch')).toBe(true);
  });

  it('lets mouse and pen drag immediately', () => {
    expect(requiresLongPress('mouse')).toBe(false);
    expect(requiresLongPress('pen')).toBe(false);
  });

  it('treats an unknown pointer type as immediate rather than stalling the drag', () => {
    expect(requiresLongPress(undefined)).toBe(false);
    expect(requiresLongPress('')).toBe(false);
  });
});

describe('pressMovedTooFar', () => {
  const start = { clientX: 100, clientY: 100 };

  it('tolerates the small wander of a stationary finger', () => {
    expect(pressMovedTooFar(start, { clientX: 103, clientY: 104 })).toBe(false);
  });

  it('abandons the press once the finger travels past the tolerance', () => {
    expect(
      pressMovedTooFar(start, { clientX: 100 + LONG_PRESS_MOVE_TOLERANCE_PX + 1, clientY: 100 }),
    ).toBe(true);
  });

  it('measures distance diagonally, not per axis', () => {
    // 6px on each axis is under the tolerance alone but ~8.49px combined.
    expect(pressMovedTooFar(start, { clientX: 106, clientY: 106 })).toBe(true);
  });

  it('keeps the press alive when coordinates are unusable', () => {
    expect(pressMovedTooFar(start, { clientX: Number.NaN, clientY: 100 })).toBe(false);
  });
});
