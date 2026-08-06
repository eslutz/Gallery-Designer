import { describe, expect, it } from 'vitest';
import {
  EDGE_SCROLL_MAX_SPEED_PX,
  EDGE_SCROLL_ZONE_PX,
  getEdgeScrollDelta,
} from './edgeAutoScroll';

describe('getEdgeScrollDelta', () => {
  const bounds = { top: 100, bottom: 700 };

  it('leaves the view alone through the middle', () => {
    expect(getEdgeScrollDelta(bounds, 400)).toBe(0);
  });

  it('pulls the view up near the top edge and down near the bottom', () => {
    expect(getEdgeScrollDelta(bounds, bounds.top + 10)).toBeLessThan(0);
    expect(getEdgeScrollDelta(bounds, bounds.bottom - 10)).toBeGreaterThan(0);
  });

  it('ramps with depth instead of switching on at full speed', () => {
    const shallow = getEdgeScrollDelta(bounds, bounds.top + EDGE_SCROLL_ZONE_PX - 5);
    const deep = getEdgeScrollDelta(bounds, bounds.top + 2);

    expect(shallow).toBeLessThan(0);
    expect(Math.abs(deep)).toBeGreaterThan(Math.abs(shallow));
  });

  it('caps at the maximum speed, including past the edge entirely', () => {
    expect(getEdgeScrollDelta(bounds, bounds.top)).toBe(-EDGE_SCROLL_MAX_SPEED_PX);
    expect(getEdgeScrollDelta(bounds, bounds.top - 500)).toBe(-EDGE_SCROLL_MAX_SPEED_PX);
    expect(getEdgeScrollDelta(bounds, bounds.bottom + 500)).toBe(EDGE_SCROLL_MAX_SPEED_PX);
  });

  it('keeps a neutral middle in a container shorter than two full zones', () => {
    const short = { top: 0, bottom: 80 };

    // Without clamping the zone the two halves would overlap and every
    // position would scroll, leaving nowhere to hold still.
    expect(getEdgeScrollDelta(short, 40)).toBe(0);
    expect(getEdgeScrollDelta(short, 2)).toBeLessThan(0);
    expect(getEdgeScrollDelta(short, 78)).toBeGreaterThan(0);
  });

  it('does nothing for an unusable pointer position or a collapsed container', () => {
    expect(getEdgeScrollDelta(bounds, Number.NaN)).toBe(0);
    expect(getEdgeScrollDelta({ top: 100, bottom: 100 }, 100)).toBe(0);
  });
});
