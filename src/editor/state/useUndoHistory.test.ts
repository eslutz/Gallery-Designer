import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useUndoHistory } from './useUndoHistory';
import { defaultState } from './galleryState';
import type { GalleryState } from './galleryState';

function withUnit(state: GalleryState, unit: GalleryState['unit']): GalleryState {
  return { ...state, unit };
}

/** Mimics how App.tsx wires the hook: `state` lives in the test component's own
 * useState, and useUndoHistory is re-invoked every render with the fresh value. */
function setup(initial: GalleryState = defaultState) {
  return renderHook(
    (props: { state: GalleryState }) => useUndoHistory({ state: props.state, setState: () => {} }),
    { initialProps: { state: initial } },
  );
}

describe('useUndoHistory', () => {
  it('starts with no undo snapshot', () => {
    const { result } = setup();
    expect(result.current.undoState).toBeNull();
  });

  it('recordUndoSnapshot() with no argument captures the state passed in on the latest render', () => {
    const first = defaultState;
    const second = withUnit(defaultState, 'cm');
    const { result, rerender } = setup(first);

    rerender({ state: second });
    act(() => {
      result.current.recordUndoSnapshot();
    });

    expect(result.current.undoState).toBe(second);
  });

  it('recordUndoSnapshot(snapshot) records the explicit snapshot instead of the current state', () => {
    const older = defaultState;
    const { result } = setup(withUnit(defaultState, 'cm'));

    act(() => {
      result.current.recordUndoSnapshot(older);
    });

    expect(result.current.undoState).toBe(older);
  });

  it('beginFieldEdit captures the state once; finishFieldEdit only records if it actually changed', () => {
    const before = defaultState;
    const { result, rerender } = setup(before);

    act(() => {
      result.current.beginFieldEdit();
    });
    // A second beginFieldEdit before finishing must not overwrite the first snapshot.
    rerender({ state: withUnit(defaultState, 'cm') });
    act(() => {
      result.current.beginFieldEdit();
    });

    act(() => {
      result.current.finishFieldEdit();
    });

    expect(result.current.undoState).toBe(before);
  });

  it('finishFieldEdit is a no-op when nothing undoable changed since beginFieldEdit', () => {
    const { result } = setup(defaultState);

    act(() => {
      result.current.beginFieldEdit();
    });
    act(() => {
      result.current.finishFieldEdit();
    });

    expect(result.current.undoState).toBeNull();
  });

  it('beginSectionDragUndo/finishSectionDragUndo mirror the field-edit bracket for section drags', () => {
    const before = defaultState;
    const { result, rerender } = setup(before);

    act(() => {
      result.current.beginSectionDragUndo();
    });
    rerender({ state: withUnit(defaultState, 'cm') });
    act(() => {
      result.current.finishSectionDragUndo();
    });

    expect(result.current.undoState).toBe(before);
  });

  it('clearUndoHistory nulls the undo snapshot and both in-progress edit brackets', () => {
    const before = defaultState;
    const { result, rerender } = setup(before);

    act(() => {
      result.current.recordUndoSnapshot(withUnit(defaultState, 'cm'));
    });
    expect(result.current.undoState).not.toBeNull();

    act(() => {
      result.current.clearUndoHistory();
    });
    expect(result.current.undoState).toBeNull();

    // The field-edit bracket must also be cleared: a begin() before the
    // clear should not be finish()-able afterward as if it were still open.
    act(() => {
      result.current.beginFieldEdit();
    });
    act(() => {
      result.current.clearUndoHistory();
    });
    rerender({ state: withUnit(defaultState, 'cm') });
    act(() => {
      result.current.finishFieldEdit();
    });
    expect(result.current.undoState).toBeNull();

    // Same for the section-drag bracket.
    act(() => {
      result.current.beginSectionDragUndo();
    });
    act(() => {
      result.current.clearUndoHistory();
    });
    act(() => {
      result.current.finishSectionDragUndo();
    });
    expect(result.current.undoState).toBeNull();
  });

  it('undoLastChange clears the snapshot after applying it', () => {
    const older = defaultState;
    const { result } = setup(withUnit(defaultState, 'cm'));

    act(() => {
      result.current.recordUndoSnapshot(older);
    });
    expect(result.current.undoState).toBe(older);

    act(() => {
      result.current.undoLastChange();
    });
    expect(result.current.undoState).toBeNull();
  });

  it('undoLastChange is a no-op when there is nothing to undo', () => {
    const { result } = setup();
    act(() => {
      result.current.undoLastChange();
    });
    expect(result.current.undoState).toBeNull();
  });
});
