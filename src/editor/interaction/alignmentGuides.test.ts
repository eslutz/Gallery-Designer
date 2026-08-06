import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAlignmentGuides } from './alignmentGuides';
import type { AlignmentGuide } from '../placement/snapping';

const guideA: AlignmentGuide = {
  axis: 'x',
  positionIn: 4,
  startIn: 0,
  endIn: 10,
} as AlignmentGuide;
const guideB: AlignmentGuide = {
  axis: 'y',
  positionIn: 6,
  startIn: 0,
  endIn: 10,
} as AlignmentGuide;
const guideC: AlignmentGuide = {
  axis: 'x',
  positionIn: 8,
  startIn: 0,
  endIn: 10,
} as AlignmentGuide;

describe('useAlignmentGuides', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no visible guides', () => {
    const { result } = renderHook(() => useAlignmentGuides(true));
    expect(result.current.visibleAlignmentGuides).toEqual({ guides: [], isLingering: false });
  });

  it('shows at most two guides, not lingering', () => {
    const { result } = renderHook(() => useAlignmentGuides(true));
    act(() => {
      result.current.showAlignmentGuides([guideA, guideB, guideC]);
    });
    expect(result.current.visibleAlignmentGuides).toEqual({
      guides: [guideA, guideB],
      isLingering: false,
    });
  });

  it('lingers shown guides and then clears them after a timeout', () => {
    const { result } = renderHook(() => useAlignmentGuides(true));
    act(() => {
      result.current.showAlignmentGuides([guideA]);
    });
    act(() => {
      result.current.lingerAlignmentGuides();
    });
    expect(result.current.visibleAlignmentGuides).toEqual({
      guides: [guideA],
      isLingering: true,
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.visibleAlignmentGuides).toEqual({ guides: [], isLingering: false });
  });

  it('lingering with no guides visible is a no-op for the guide list', () => {
    const { result } = renderHook(() => useAlignmentGuides(true));
    act(() => {
      result.current.lingerAlignmentGuides();
    });
    expect(result.current.visibleAlignmentGuides).toEqual({ guides: [], isLingering: false });
  });

  it('clears guides when the showAlignmentGuides feature flag turns off', () => {
    const { result, rerender } = renderHook(({ enabled }) => useAlignmentGuides(enabled), {
      initialProps: { enabled: true },
    });
    act(() => {
      result.current.showAlignmentGuides([guideA]);
    });
    expect(result.current.visibleAlignmentGuides.guides).toHaveLength(1);

    rerender({ enabled: false });
    expect(result.current.visibleAlignmentGuides).toEqual({ guides: [], isLingering: false });
  });
});
