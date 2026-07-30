import type { WallSection } from '../types';
import { getWallBounds } from './wall';

const DEFAULT_WALL_PADDING_IN = 14;
const DEFAULT_WALL_LABEL_GAP_IN = 10;
const MIN_WALL_ZOOM = 0.5;
const MAX_WALL_ZOOM = 4;

export interface WallViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WallZoomState {
  scale: number;
  centerX: number;
  centerY: number;
}

export function getWallCanvasBaseViewBox(sections: WallSection[]): WallViewBox {
  const wallBounds = getWallBounds(sections);
  const padding = DEFAULT_WALL_PADDING_IN;
  return {
    x: wallBounds.minX - padding,
    y: wallBounds.minY - padding,
    width: Math.max(1, wallBounds.width + padding * 2),
    height: Math.max(1, wallBounds.height + padding * 2 + DEFAULT_WALL_LABEL_GAP_IN),
  };
}

export function getDefaultWallZoomState(baseViewBox: WallViewBox): WallZoomState {
  return {
    scale: 1,
    centerX: baseViewBox.x + baseViewBox.width / 2,
    centerY: baseViewBox.y + baseViewBox.height / 2,
  };
}

export function getWallZoomedViewBox(baseViewBox: WallViewBox, zoom: WallZoomState): WallViewBox {
  const scale = clampWallZoomScale(zoom.scale);
  const width = baseViewBox.width / scale;
  const height = baseViewBox.height / scale;
  return {
    x: zoom.centerX - width / 2,
    y: zoom.centerY - height / 2,
    width,
    height,
  };
}

export function zoomWallStateAroundPoint(
  baseViewBox: WallViewBox,
  currentViewBox: WallViewBox,
  nextScale: number,
  focusPoint?: { x: number; y: number } | null,
): WallZoomState {
  const scale = clampWallZoomScale(nextScale);
  const nextWidth = baseViewBox.width / scale;
  const nextHeight = baseViewBox.height / scale;
  const focus = focusPoint ?? {
    x: currentViewBox.x + currentViewBox.width / 2,
    y: currentViewBox.y + currentViewBox.height / 2,
  };
  const relativeX = (focus.x - currentViewBox.x) / Math.max(0.01, currentViewBox.width);
  const relativeY = (focus.y - currentViewBox.y) / Math.max(0.01, currentViewBox.height);

  return {
    scale,
    ...clampWallZoomCenter(
      baseViewBox,
      nextWidth,
      nextHeight,
      focus.x + (0.5 - relativeX) * nextWidth,
      focus.y + (0.5 - relativeY) * nextHeight,
    ),
  };
}

export function clampWallZoomScale(scale: number): number {
  return Math.min(MAX_WALL_ZOOM, Math.max(MIN_WALL_ZOOM, scale));
}

export function clampWallZoomCenter(
  baseViewBox: WallViewBox,
  viewBoxWidth: number,
  viewBoxHeight: number,
  centerX: number,
  centerY: number,
): Pick<WallZoomState, 'centerX' | 'centerY'> {
  return {
    centerX: clampViewBoxCenter(baseViewBox.x, baseViewBox.width, viewBoxWidth, centerX),
    centerY: clampViewBoxCenter(baseViewBox.y, baseViewBox.height, viewBoxHeight, centerY),
  };
}

export function clampViewBoxCenter(
  baseStart: number,
  baseSize: number,
  viewBoxSize: number,
  center: number,
): number {
  if (viewBoxSize >= baseSize) {
    return baseStart + baseSize / 2;
  }

  const minCenter = baseStart + viewBoxSize / 2;
  const maxCenter = baseStart + baseSize - viewBoxSize / 2;
  return Math.min(maxCenter, Math.max(minCenter, center));
}

/**
 * Sub-quarter-inch center movement is visually nothing, and float noise from the
 * client-px -> viewBox-unit conversion lands well under it. Treating those as
 * "absorbed nothing" is what lets a pinned edge release the gesture instead of
 * capturing it forever on rounding dust.
 */
const WALL_PAN_ABSORPTION_EPSILON_IN = 0.01;

export interface WallPanAbsorption extends Pick<WallZoomState, 'centerX' | 'centerY'> {
  absorbedX: boolean;
  absorbedY: boolean;
  /** True when the pan moved the view on either axis. */
  absorbed: boolean;
}

/**
 * Clamps a requested pan center and reports which axes actually moved.
 *
 * Callers use this to decide whether to capture the originating gesture: a pan
 * that absorbs nothing is one the wall cannot service, so the event should stay
 * available to the surrounding scroll container (same chaining feel as
 * `overscroll-behavior` on nested scrollers).
 */
export function resolveWallPan(
  baseViewBox: WallViewBox,
  viewBoxWidth: number,
  viewBoxHeight: number,
  currentCenterX: number,
  currentCenterY: number,
  requestedCenterX: number,
  requestedCenterY: number,
): WallPanAbsorption {
  const next = clampWallZoomCenter(
    baseViewBox,
    viewBoxWidth,
    viewBoxHeight,
    requestedCenterX,
    requestedCenterY,
  );
  const absorbedX = Math.abs(next.centerX - currentCenterX) > WALL_PAN_ABSORPTION_EPSILON_IN;
  const absorbedY = Math.abs(next.centerY - currentCenterY) > WALL_PAN_ABSORPTION_EPSILON_IN;

  return {
    centerX: next.centerX,
    centerY: next.centerY,
    absorbedX,
    absorbedY,
    absorbed: absorbedX || absorbedY,
  };
}
