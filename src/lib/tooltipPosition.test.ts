import { describe, expect, it } from 'vitest';
import { calculateTooltipPosition } from './tooltipPosition';

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
});
