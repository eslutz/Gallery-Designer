import { describe, expect, it } from 'vitest';
import {
  clampViewBoxCenter,
  clampWallZoomCenter,
  clampWallZoomScale,
  getDefaultWallZoomState,
  getWallCanvasBaseViewBox,
  getWallZoomedViewBox,
  resolveWallPan,
  zoomWallStateAroundPoint,
} from './wallZoom';
import type { WallSection } from '../types';

const sections: WallSection[] = [
  { id: 'wall', name: 'Wall', widthIn: 96, heightIn: 84, xIn: 0, yIn: 0 },
];

describe('wall zoom geometry', () => {
  it('pads the base view box around the wall bounds', () => {
    const viewBox = getWallCanvasBaseViewBox(sections);
    expect(viewBox).toEqual({ x: -14, y: -14, width: 124, height: 122 });
  });

  it('starts at scale 1 centered on the base view box', () => {
    const baseViewBox = getWallCanvasBaseViewBox(sections);
    expect(getDefaultWallZoomState(baseViewBox)).toEqual({
      scale: 1,
      centerX: baseViewBox.x + baseViewBox.width / 2,
      centerY: baseViewBox.y + baseViewBox.height / 2,
    });
  });

  it('shrinks the view box as scale increases', () => {
    const baseViewBox = getWallCanvasBaseViewBox(sections);
    const zoomed = getWallZoomedViewBox(baseViewBox, {
      scale: 2,
      centerX: baseViewBox.x + baseViewBox.width / 2,
      centerY: baseViewBox.y + baseViewBox.height / 2,
    });
    expect(zoomed.width).toBeCloseTo(baseViewBox.width / 2);
    expect(zoomed.height).toBeCloseTo(baseViewBox.height / 2);
  });

  it('clamps scale to the configured min and max', () => {
    expect(clampWallZoomScale(0.1)).toBe(0.5);
    expect(clampWallZoomScale(10)).toBe(4);
    expect(clampWallZoomScale(2)).toBe(2);
  });

  it('clamps the view box center so it never exits the base bounds', () => {
    expect(clampViewBoxCenter(0, 100, 20, -50)).toBe(10);
    expect(clampViewBoxCenter(0, 100, 20, 500)).toBe(90);
    expect(clampViewBoxCenter(0, 100, 20, 50)).toBe(50);
  });

  it('keeps the center fixed when the zoomed view box is larger than the base', () => {
    const result = clampWallZoomCenter({ x: 0, y: 0, width: 100, height: 80 }, 200, 160, 999, -999);
    expect(result).toEqual({ centerX: 50, centerY: 40 });
  });

  it('zooms around a focus point without moving that point on screen', () => {
    const baseViewBox = getWallCanvasBaseViewBox(sections);
    const start = getDefaultWallZoomState(baseViewBox);
    const currentViewBox = getWallZoomedViewBox(baseViewBox, start);
    const focus = { x: currentViewBox.x, y: currentViewBox.y };

    const next = zoomWallStateAroundPoint(baseViewBox, currentViewBox, 2, focus);

    expect(next.scale).toBe(2);
    const nextViewBox = getWallZoomedViewBox(baseViewBox, next);
    // The focus point should still land at (or very near) the same corner.
    expect(nextViewBox.x).toBeCloseTo(focus.x, 1);
    expect(nextViewBox.y).toBeCloseTo(focus.y, 1);
  });

  it('falls back to the view box center when no focus point is given', () => {
    const baseViewBox = getWallCanvasBaseViewBox(sections);
    const start = getDefaultWallZoomState(baseViewBox);
    const currentViewBox = getWallZoomedViewBox(baseViewBox, start);

    const next = zoomWallStateAroundPoint(baseViewBox, currentViewBox, 2);

    expect(next.centerX).toBeCloseTo(start.centerX);
    expect(next.centerY).toBeCloseTo(start.centerY);
  });
});

describe('resolveWallPan', () => {
  // 100x80 wall viewed through a 50x40 window: the center can range over
  // x 25..75 and y 20..60.
  const baseViewBox = { x: 0, y: 0, width: 100, height: 80 };
  const viewBoxWidth = 50;
  const viewBoxHeight = 40;

  function pan(fromX: number, fromY: number, toX: number, toY: number) {
    return resolveWallPan(baseViewBox, viewBoxWidth, viewBoxHeight, fromX, fromY, toX, toY);
  }

  it('absorbs a pan that stays inside the wall bounds', () => {
    const result = pan(50, 40, 60, 45);

    expect(result).toMatchObject({ centerX: 60, centerY: 45, absorbedX: true, absorbedY: true });
    expect(result.absorbed).toBe(true);
  });

  it('absorbs the portion up to the edge when a pan overshoots', () => {
    const result = pan(70, 40, 999, 40);

    expect(result.centerX).toBe(75);
    expect(result.absorbedX).toBe(true);
    expect(result.absorbedY).toBe(false);
    expect(result.absorbed).toBe(true);
  });

  it('absorbs nothing once pinned against an edge', () => {
    const result = pan(75, 40, 999, 40);

    expect(result.centerX).toBe(75);
    expect(result.absorbedX).toBe(false);
    expect(result.absorbed).toBe(false);
  });

  it('reports each axis independently, so a pinned axis does not mask a free one', () => {
    const result = pan(75, 40, 999, 50);

    expect(result.absorbedX).toBe(false);
    expect(result.absorbedY).toBe(true);
    expect(result.absorbed).toBe(true);
  });

  it('treats sub-epsilon movement as absorbing nothing', () => {
    const result = pan(50, 40, 50.0001, 40.0001);

    expect(result.absorbedX).toBe(false);
    expect(result.absorbedY).toBe(false);
    expect(result.absorbed).toBe(false);
  });

  it('absorbs nothing when the wall fits entirely in view', () => {
    const result = resolveWallPan(baseViewBox, 200, 160, 50, 40, 90, 70);

    expect(result).toMatchObject({ centerX: 50, centerY: 40, absorbed: false });
  });
});
