/**
 * Edge auto-scrolling for drags.
 *
 * The staging tray and the wall canvas do not always fit on screen together —
 * on a phone the tray sits well below the wall — so a piece dragged out of the
 * tray has nowhere visible to go. Holding near the edge of the scroll container
 * pulls the view along, the same way dragging a file to the edge of a window
 * scrolls it.
 */

/** How close to an edge the pointer has to get before the view starts moving. */
export const EDGE_SCROLL_ZONE_PX = 76;

/** Fastest the view travels, in px per animation frame, right at the edge. */
export const EDGE_SCROLL_MAX_SPEED_PX = 16;

/**
 * Pixels to scroll this frame: negative pulls the view up, positive pushes it
 * down, zero leaves it alone.
 *
 * Speed ramps with depth into the zone rather than switching on abruptly, so
 * easing toward an edge nudges the view and pinning against it moves fastest.
 */
export function getEdgeScrollDelta(
  bounds: { top: number; bottom: number },
  clientY: number,
  zonePx: number = EDGE_SCROLL_ZONE_PX,
  maxSpeedPx: number = EDGE_SCROLL_MAX_SPEED_PX,
): number {
  if (!Number.isFinite(clientY) || zonePx <= 0) {
    return 0;
  }

  const height = bounds.bottom - bounds.top;
  if (height <= 0) {
    return 0;
  }
  // A container shorter than both zones would otherwise auto-scroll everywhere,
  // leaving no neutral middle to hold still in.
  const zone = Math.min(zonePx, height / 2);

  const fromTop = clientY - bounds.top;
  if (fromTop < zone) {
    // Past the edge entirely still counts, and at full speed — a finger can be
    // dragged beyond the container while the view should keep travelling.
    const depth = Math.min(1, Math.max(0, (zone - fromTop) / zone));
    return -Math.ceil(depth * maxSpeedPx);
  }

  const fromBottom = bounds.bottom - clientY;
  if (fromBottom < zone) {
    const depth = Math.min(1, Math.max(0, (zone - fromBottom) / zone));
    return Math.ceil(depth * maxSpeedPx);
  }

  return 0;
}

/**
 * Nearest ancestor that can actually scroll vertically, starting with the
 * element itself. Which element that is changes with the layout — the editor
 * column scrolls on desktop, the workspace on mobile — so it is resolved live
 * rather than hard-coded.
 */
export function findVerticalScrollContainer(start: Element | null): HTMLElement | null {
  let node: Element | null = start;
  while (node instanceof HTMLElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
