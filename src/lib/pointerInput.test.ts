import { describe, expect, it } from 'vitest';
import {
  distanceBetween,
  getPointerId,
  isTextEntryTarget,
  isWallPanTarget,
  midpointBetween,
  normalizeWheelDelta,
  tryCapturePointer,
} from './pointerInput';

describe('pointer input helpers', () => {
  it('treats the wall pan surface and its exterior edge as pan targets', () => {
    const surface = document.createElement('div');
    surface.className = 'wall-pan-surface';
    const child = document.createElement('span');
    surface.append(child);
    document.body.append(surface);

    expect(isWallPanTarget(child)).toBe(true);
    expect(isWallPanTarget(document.body)).toBe(false);
    expect(isWallPanTarget(null)).toBe(false);
  });

  it('treats form controls as text-entry targets', () => {
    const input = document.createElement('input');
    document.body.append(input);

    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(document.body)).toBe(false);
  });

  it('treats contenteditable elements as text-entry targets', () => {
    const editableEmpty = document.createElement('div');
    editableEmpty.setAttribute('contenteditable', '');
    const editableTrue = document.createElement('div');
    editableTrue.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editableTrue.append(child);
    document.body.append(editableEmpty, editableTrue);

    expect(isTextEntryTarget(editableEmpty)).toBe(true);
    expect(isTextEntryTarget(editableTrue)).toBe(true);
    expect(isTextEntryTarget(child)).toBe(true);
  });

  it('converts wheel deltas to pixels for line and page delta modes', () => {
    expect(normalizeWheelDelta({ deltaMode: 0, deltaX: 10, deltaY: -5 })).toEqual({
      x: 10,
      y: -5,
    });
    expect(normalizeWheelDelta({ deltaMode: 1, deltaX: 2, deltaY: 0 })).toEqual({ x: 32, y: 0 });
    expect(normalizeWheelDelta({ deltaMode: 2, deltaX: 0, deltaY: 1 })).toEqual({ x: 0, y: 240 });
  });

  it('falls back to -1 for a missing or non-finite pointer id', () => {
    expect(getPointerId({ pointerId: 7 })).toBe(7);
    expect(getPointerId({})).toBe(-1);
    expect(getPointerId({ pointerId: Number.NaN })).toBe(-1);
  });

  it('captures the pointer when supported, and swallows capture errors', () => {
    const captured: number[] = [];
    const element = {
      setPointerCapture: (id: number) => captured.push(id),
    } as unknown as Element;
    tryCapturePointer(element, 3);
    expect(captured).toEqual([3]);

    const throwing = {
      setPointerCapture: () => {
        throw new Error('no active pointer');
      },
    } as unknown as Element;
    expect(() => tryCapturePointer(throwing, 3)).not.toThrow();

    // jsdom elements don't implement setPointerCapture at all — the function
    // must guard on that rather than assume every Element has it.
    const withoutCapture = document.createElement('div');
    expect(() => tryCapturePointer(withoutCapture, 3)).not.toThrow();
  });

  it('measures distance and midpoint between two client points', () => {
    const a = { clientX: 0, clientY: 0 };
    const b = { clientX: 3, clientY: 4 };
    expect(distanceBetween(a, b)).toBe(5);
    expect(midpointBetween(a, b)).toEqual({ clientX: 1.5, clientY: 2 });
  });
});
