import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStatusToast } from './useStatusToast';
import type { AutoPlacementDiagnostics } from '../lib/autoPlace';

const diagnostics: AutoPlacementDiagnostics = {
  attempts: [{ family: 'grid', reason: 'not enough wall space' }],
  resolvedGapIn: 2,
  resolvedOuterMarginIn: 3,
} as AutoPlacementDiagnostics;

function setup(initial: {
  message: string;
  messageTone: 'info' | 'error';
  messageRevision: number;
  unit: 'in' | 'cm';
}) {
  return renderHook((props: typeof initial) => useStatusToast(props), { initialProps: initial });
}

describe('useStatusToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show the toast for the initial revision', () => {
    const { result } = setup({
      message: 'Ready',
      messageTone: 'info',
      messageRevision: 0,
      unit: 'in',
    });
    expect(result.current.toastVisible).toBe(false);
  });

  it('shows the toast when the revision changes, and auto-hides after the info delay', () => {
    const { result, rerender } = setup({
      message: 'Ready',
      messageTone: 'info',
      messageRevision: 0,
      unit: 'in',
    });

    rerender({ message: 'Added a piece.', messageTone: 'info', messageRevision: 1, unit: 'in' });
    expect(result.current.toastVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(result.current.toastVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toastVisible).toBe(false);
  });

  it('uses a longer auto-hide delay for error-toned messages', () => {
    const { result, rerender } = setup({
      message: 'Ready',
      messageTone: 'info',
      messageRevision: 0,
      unit: 'in',
    });

    rerender({
      message: 'Could not place item.',
      messageTone: 'error',
      messageRevision: 1,
      unit: 'in',
    });
    expect(result.current.toastVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.toastVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.toastVisible).toBe(false);
  });

  it('does not re-show the toast for a revision already shown (StrictMode double-invoke guard)', () => {
    const { result, rerender } = setup({
      message: 'Ready',
      messageTone: 'info',
      messageRevision: 0,
      unit: 'in',
    });

    rerender({ message: 'Added a piece.', messageTone: 'info', messageRevision: 1, unit: 'in' });
    expect(result.current.toastVisible).toBe(true);

    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toastVisible).toBe(false);

    // A re-render at the SAME revision (what StrictMode's second effect invocation, or any
    // unrelated re-render, looks like) must not resurrect the toast.
    rerender({ message: 'Added a piece.', messageTone: 'info', messageRevision: 1, unit: 'in' });
    expect(result.current.toastVisible).toBe(false);
  });

  it('dismissToast hides the toast immediately', () => {
    const { result, rerender } = setup({
      message: 'Ready',
      messageTone: 'info',
      messageRevision: 0,
      unit: 'in',
    });
    rerender({ message: 'Added a piece.', messageTone: 'info', messageRevision: 1, unit: 'in' });
    expect(result.current.toastVisible).toBe(true);

    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toastVisible).toBe(false);
  });

  it('builds toastDetails from autoPlacementFailure only when it matches the current message', () => {
    const { result, rerender } = setup({
      message: 'Could not place all pieces.',
      messageTone: 'error',
      messageRevision: 1,
      unit: 'in',
    });

    act(() => {
      result.current.setAutoPlacementFailure({ message: 'Different message', diagnostics });
    });
    rerender({
      message: 'Could not place all pieces.',
      messageTone: 'error',
      messageRevision: 1,
      unit: 'in',
    });
    expect(result.current.toastDetails).toBeUndefined();

    act(() => {
      result.current.setAutoPlacementFailure({
        message: 'Could not place all pieces.',
        diagnostics,
      });
    });
    rerender({
      message: 'Could not place all pieces.',
      messageTone: 'error',
      messageRevision: 1,
      unit: 'in',
    });
    expect(result.current.toastDetails).toContain('grid: not enough wall space');
  });
});
