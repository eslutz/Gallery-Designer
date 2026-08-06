/**
 * Timing rules for picking a staged item up by touch.
 *
 * The staging tray scrolls horizontally, and a card fills nearly all of it, so
 * a touch landing on a card is ambiguous: scroll the tray, or pick the piece
 * up? `touch-action` cannot settle it — a directional value (`pan-x`) proved
 * unreliable on iOS Safari, and `none` kills scrolling outright. So the card
 * stays scrollable and a deliberate hold is what claims the gesture instead.
 */

/** Long enough to be deliberate, short enough not to feel broken. */
export const LONG_PRESS_DELAY_MS = 280;

/**
 * Fingers wander. Anything past this reads as the start of a scroll rather than
 * a hold, so the press is abandoned and the browser keeps the gesture.
 */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

interface PressPoint {
  clientX: number;
  clientY: number;
}

/**
 * Touch is the only input that competes with scrolling. A mouse scrolls with
 * the wheel and a pen is precise, so both keep dragging immediately — adding a
 * hold there would only make the app feel unresponsive.
 */
export function requiresLongPress(pointerType: string | undefined): boolean {
  return pointerType === 'touch';
}

export function pressMovedTooFar(
  start: PressPoint,
  current: PressPoint,
  tolerancePx: number = LONG_PRESS_MOVE_TOLERANCE_PX,
): boolean {
  if (
    !Number.isFinite(current.clientX) ||
    !Number.isFinite(current.clientY) ||
    !Number.isFinite(start.clientX) ||
    !Number.isFinite(start.clientY)
  ) {
    return false;
  }
  return Math.hypot(current.clientX - start.clientX, current.clientY - start.clientY) > tolerancePx;
}
