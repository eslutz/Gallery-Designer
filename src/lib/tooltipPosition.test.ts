import { describe, expect, it } from 'vitest';
import {
  avoidTooltipCollisions,
  calculateTooltipPosition,
  getStagedPreviewObstacles,
  getTooltipElementSize,
} from './tooltipPosition';

describe('tooltip positioning', () => {
  it('clamps tooltips near the right viewport edge', () => {
    const position = calculateTooltipPosition(
      { left: 376, top: 100, width: 18, height: 18 },
      { width: 240, height: 90 },
      { width: 390, height: 844 },
    );

    expect(position.left).toBe(142);
    expect(position.left + position.maxWidth).toBeLessThanOrEqual(382);
    expect(position.placement).toBe('bottom');
  });

  it('clamps tooltips near the left viewport edge', () => {
    const position = calculateTooltipPosition(
      { left: 0, top: 100, width: 18, height: 18 },
      { width: 240, height: 90 },
      { width: 390, height: 844 },
    );

    expect(position.left).toBe(8);
    expect(position.left).toBeGreaterThanOrEqual(8);
  });

  it('flips above the trigger near the bottom viewport edge', () => {
    const position = calculateTooltipPosition(
      { left: 180, top: 810, width: 18, height: 18 },
      { width: 240, height: 90 },
      { width: 390, height: 844 },
    );

    expect(position.placement).toBe('top');
    expect(position.top + 90).toBeLessThanOrEqual(802);
  });

  it('limits width in very narrow viewports', () => {
    const position = calculateTooltipPosition(
      { left: 90, top: 40, width: 18, height: 18 },
      { width: 240, height: 90 },
      { width: 180, height: 320 },
    );

    expect(position.maxWidth).toBe(164);
    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left + position.maxWidth).toBeLessThanOrEqual(172);
  });

  it('limits height in very short viewports', () => {
    const position = calculateTooltipPosition(
      { left: 90, top: 30, width: 18, height: 18 },
      { width: 240, height: 180 },
      { width: 320, height: 120 },
    );

    expect(position.maxHeight).toBe(104);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(112);
  });

  it('moves a tooltip away from an adjacent staged preview', () => {
    const position = avoidTooltipCollisions(
      {
        left: 449,
        top: 201,
        maxWidth: 206,
        maxHeight: 38,
        placement: 'bottom',
      },
      { width: 206, height: 38 },
      [{ left: 607, top: 160, width: 672, height: 240 }],
      { width: 1340, height: 550 },
    );

    expect(position.left).toBe(393);
    expect(position.left + 206).toBeLessThan(607);
  });
});

describe('getTooltipElementSize', () => {
  it('uses whichever is larger of the bounding rect and scroll size', () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ width: 100, height: 40 }) as DOMRect;
    Object.defineProperty(element, 'scrollWidth', { value: 120, configurable: true });
    Object.defineProperty(element, 'scrollHeight', { value: 30, configurable: true });

    expect(getTooltipElementSize(element)).toEqual({ width: 120, height: 40 });
  });
});

describe('getStagedPreviewObstacles', () => {
  it("excludes the button's own preview and previews with no area", () => {
    const ownShell = document.createElement('div');
    ownShell.className = 'staged-piece-preview-shell';
    const button = document.createElement('button');
    ownShell.append(button);
    const ownPreview = document.createElement('div');
    ownPreview.className = 'staged-piece-preview';
    ownShell.append(ownPreview);
    document.body.append(ownShell);

    const otherPreview = document.createElement('div');
    otherPreview.className = 'staged-piece-preview';
    otherPreview.getBoundingClientRect = () =>
      ({ left: 50, top: 60, width: 20, height: 10 }) as DOMRect;
    document.body.append(otherPreview);

    const zeroSizePreview = document.createElement('div');
    zeroSizePreview.className = 'staged-piece-preview';
    zeroSizePreview.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    document.body.append(zeroSizePreview);

    const obstacles = getStagedPreviewObstacles(button, 5, 10);

    expect(obstacles).toEqual([{ left: 45, top: 50, width: 20, height: 10 }]);
  });
});
