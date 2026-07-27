export const WALL_MOUSE_PAN_ID = -2;
export const POINTER_DRAG_THRESHOLD_PX = 4;

export function isWallPanTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && Boolean(target.closest('.wall-pan-surface, .wall-exterior-edge'))
  );
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, select, textarea'));
}

export function normalizeWheelDelta(event: { deltaMode: number; deltaX: number; deltaY: number }): {
  x: number;
  y: number;
} {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
  return {
    x: event.deltaX * unit,
    y: event.deltaY * unit,
  };
}

export function getPointerId(event: { pointerId?: number }): number {
  return Number.isFinite(event.pointerId) ? Number(event.pointerId) : -1;
}

export function tryCapturePointer(element: Element, pointerId: number) {
  if (!Number.isFinite(pointerId) || typeof element.setPointerCapture !== 'function') {
    return;
  }
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events and older browsers can expose capture without an active pointer.
  }
}

export function distanceBetween(
  first: { clientX: number; clientY: number },
  second: { clientX: number; clientY: number },
) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

export function midpointBetween(
  first: { clientX: number; clientY: number },
  second: { clientX: number; clientY: number },
) {
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  };
}
