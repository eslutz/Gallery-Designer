import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWallZoomPan } from './useWallZoomPan';
import { getDefaultWallZoomState, getWallCanvasBaseViewBox } from './zoom';
import type { WallSection } from '../../types';

const sections: WallSection[] = [
  { id: 'section-1', name: 'Section 1', widthIn: 120, heightIn: 96, xIn: 0, yIn: 0 },
];

function setup(overrides: Partial<Parameters<typeof useWallZoomPan>[0]> = {}) {
  const onInteractionChange = vi.fn();
  const hasBlockingDrag = vi.fn(() => false);
  const startSuppressingTextSelection = vi.fn();
  const stopSuppressingTextSelection = vi.fn();
  const rendered = renderHook(
    (props: { sections: WallSection[] }) =>
      useWallZoomPan({
        sections: props.sections,
        onInteractionChange,
        hasBlockingDrag,
        startSuppressingTextSelection,
        stopSuppressingTextSelection,
        ...overrides,
      }),
    { initialProps: { sections } },
  );
  return {
    ...rendered,
    onInteractionChange,
    hasBlockingDrag,
    startSuppressingTextSelection,
    stopSuppressingTextSelection,
  };
}

describe('useWallZoomPan', () => {
  it('starts at the default zoom state for the given sections', () => {
    const { result } = setup();
    const expected = getDefaultWallZoomState(getWallCanvasBaseViewBox(sections));
    expect(result.current.wallZoom).toEqual(expected);
  });

  it('zoomWallBy scales around the current center and clamps to the zoom bounds', () => {
    const { result } = setup();
    act(() => {
      result.current.zoomWallBy(2);
    });
    expect(result.current.wallZoom.scale).toBeCloseTo(2);

    act(() => {
      result.current.zoomWallBy(100);
    });
    expect(result.current.wallZoom.scale).toBeLessThanOrEqual(4);
  });

  it('fitWallZoom resets to the default zoom and clears panning-wall interaction', () => {
    const { result, onInteractionChange } = setup();
    act(() => {
      result.current.zoomWallBy(2);
    });
    act(() => {
      result.current.fitWallZoom();
    });
    expect(result.current.wallZoom).toEqual(
      getDefaultWallZoomState(getWallCanvasBaseViewBox(sections)),
    );
    expect(onInteractionChange).toHaveBeenCalled();
    const updater = onInteractionChange.mock.calls.at(-1)?.[0] as (c: string) => string;
    expect(updater('panning-wall')).toBe('idle');
    expect(updater('dragging-piece')).toBe('dragging-piece');
  });

  it('clientPointToSvg and svgPointToClient return null without a mounted SVG', () => {
    const { result } = setup();
    expect(result.current.clientPointToSvg({ clientX: 10, clientY: 10 })).toBeNull();
    expect(result.current.svgPointToClient({ x: 10, y: 10 })).toBeNull();
  });

  it('startWallPan/updateWallPan/finishWallPan drive a full pan cycle', () => {
    const {
      result,
      startSuppressingTextSelection,
      stopSuppressingTextSelection,
      onInteractionChange,
    } = setup();
    const rect = { width: 400, height: 300 } as DOMRect;

    // Panning is clamped to a no-op at 1x zoom (the viewbox already fills the base bounds),
    // so zoom in first to give the pan somewhere to go.
    act(() => {
      result.current.zoomWallBy(2);
    });

    act(() => {
      result.current.startWallPan({ clientX: 100, clientY: 100 }, 1, rect);
    });
    expect(onInteractionChange).toHaveBeenLastCalledWith('panning-wall');
    expect(startSuppressingTextSelection).toHaveBeenCalledTimes(1);

    const centerBefore = result.current.wallZoom.centerX;
    act(() => {
      const handled = result.current.updateWallPan({ clientX: 150, clientY: 100, pointerId: 1 });
      expect(handled).toBe(true);
    });
    expect(result.current.wallZoom.centerX).not.toBe(centerBefore);

    act(() => {
      result.current.finishWallPan({ pointerId: 1 });
    });
    expect(onInteractionChange).toHaveBeenLastCalledWith('idle');
    expect(stopSuppressingTextSelection).toHaveBeenCalledTimes(1);

    // Once finished, further pan updates for the same pointer no longer apply.
    act(() => {
      const handled = result.current.updateWallPan({ clientX: 200, clientY: 100, pointerId: 1 });
      expect(handled).toBe(false);
    });
  });

  it('handleWallWheelInput pans on a plain wheel and zooms with a modifier key', () => {
    const { result } = setup();
    const centerBefore = result.current.wallZoom.centerX;

    act(() => {
      result.current.handleWallWheelInput({
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        clientX: 0,
        clientY: 0,
        deltaMode: 0,
        deltaX: 10,
        deltaY: 0,
      });
    });
    // No mounted SVG means panWallByWheel bails out (no bounding rect) - state unchanged.
    expect(result.current.wallZoom.centerX).toBe(centerBefore);

    act(() => {
      result.current.handleWallWheelInput({
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        clientX: 0,
        clientY: 0,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -100,
      });
    });
    expect(result.current.wallZoom.scale).toBeGreaterThan(1);
  });
});
