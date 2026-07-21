export interface TooltipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TooltipViewport {
  width: number;
  height: number;
}

export interface TooltipPositionOptions {
  gap?: number;
  padding?: number;
  preferredWidth?: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

export function calculateTooltipPosition(
  triggerRect: TooltipRect,
  tooltipSize: Pick<TooltipRect, 'width' | 'height'>,
  viewport: TooltipViewport,
  options: TooltipPositionOptions = {},
): TooltipPosition {
  const gap = options.gap ?? 8;
  const padding = options.padding ?? 8;
  const availableWidth = Math.max(0, viewport.width - padding * 2);
  const availableHeight = Math.max(0, viewport.height - padding * 2);
  const maxWidth = Math.min(options.preferredWidth ?? tooltipSize.width, availableWidth);
  const effectiveWidth = Math.min(tooltipSize.width, maxWidth);
  const maxHeight = availableHeight;
  const effectiveHeight = Math.min(tooltipSize.height, maxHeight);
  const centeredLeft = triggerRect.left + triggerRect.width / 2 - effectiveWidth / 2;
  const left = clamp(centeredLeft, padding, viewport.width - padding - effectiveWidth);
  const bottomTop = triggerRect.top + triggerRect.height + gap;
  const topTop = triggerRect.top - effectiveHeight - gap;
  const fitsBelow = bottomTop + effectiveHeight <= viewport.height - padding;
  const fitsAbove = topTop >= padding;
  const placement = fitsBelow || !fitsAbove ? 'bottom' : 'top';
  const preferredTop = placement === 'bottom' ? bottomTop : topTop;
  const top = clamp(preferredTop, padding, viewport.height - padding - effectiveHeight);

  return {
    left,
    top,
    maxWidth,
    maxHeight,
    placement,
  };
}

export function avoidTooltipCollisions(
  position: TooltipPosition,
  tooltipSize: Pick<TooltipRect, 'width' | 'height'>,
  obstacles: TooltipRect[],
  viewport: TooltipViewport,
  options: Pick<TooltipPositionOptions, 'gap' | 'padding'> = {},
): TooltipPosition {
  const gap = options.gap ?? 8;
  const padding = options.padding ?? 8;
  const width = Math.min(tooltipSize.width, position.maxWidth);
  const height = Math.min(tooltipSize.height, position.maxHeight);
  let left = position.left;

  for (const obstacle of obstacles) {
    const overlapsHorizontally =
      left < obstacle.left + obstacle.width && left + width > obstacle.left;
    const overlapsVertically =
      position.top < obstacle.top + obstacle.height && position.top + height > obstacle.top;

    if (!overlapsHorizontally || !overlapsVertically) {
      continue;
    }

    const obstacleIsToTheRight = obstacle.left + obstacle.width / 2 >= left + width / 2;
    const requestedLeft = obstacleIsToTheRight
      ? obstacle.left - gap - width
      : obstacle.left + obstacle.width + gap;
    left = clamp(requestedLeft, padding, viewport.width - padding - width);
  }

  return { ...position, left };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
