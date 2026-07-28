import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { withMessage, type GalleryState } from '../lib/galleryState';

export interface UseUndoHistoryParams {
  /** The live gallery state, passed in fresh on every render. */
  state: GalleryState;
  setState: Dispatch<SetStateAction<GalleryState>>;
}

/**
 * Owns the single-slot undo snapshot (`undoState`) and the two "was this edit
 * actually undoable" snapshot refs used to bracket a field edit or a section drag.
 *
 * Unlike the App.tsx code this replaces, nothing here reads a ref to dodge stale
 * closures: `state` is passed in as an explicit parameter on every call, so
 * `recordUndoSnapshot()`'s default snapshot and the undoable-change checks below
 * always see this render's state directly. That's what `latestStateRef` was for
 * within the undo logic specifically — it's not needed here anymore. (App.tsx
 * still keeps its own `latestStateRef` for unrelated reads elsewhere.)
 */
export function useUndoHistory({ state, setState }: UseUndoHistoryParams) {
  const [undoState, setUndoState] = useState<GalleryState | null>(null);
  const fieldEditUndoSnapshotRef = useRef<GalleryState | null>(null);
  const sectionDragUndoSnapshotRef = useRef<GalleryState | null>(null);

  function getUndoFingerprint(snapshot: GalleryState) {
    return JSON.stringify({
      unit: snapshot.unit,
      themeMode: snapshot.themeMode,
      applicationTheme: snapshot.applicationTheme,
      sections: snapshot.sections,
      pieces: snapshot.pieces,
      placements: snapshot.placements,
      features: snapshot.features,
      autoPlacementSettings: snapshot.autoPlacementSettings,
    });
  }

  function hasUndoableChange(before: GalleryState, after: GalleryState) {
    return getUndoFingerprint(before) !== getUndoFingerprint(after);
  }

  function recordUndoSnapshot(snapshot: GalleryState = state) {
    setUndoState(snapshot);
  }

  function beginFieldEdit() {
    fieldEditUndoSnapshotRef.current ??= state;
  }

  function finishFieldEdit() {
    const snapshot = fieldEditUndoSnapshotRef.current;
    fieldEditUndoSnapshotRef.current = null;
    if (snapshot && hasUndoableChange(snapshot, state)) {
      recordUndoSnapshot(snapshot);
    }
  }

  /** Mirrors beginFieldEdit/finishFieldEdit for a section drag, which App.tsx's drag
   * cluster brackets the same way but can't call beginFieldEdit/finishFieldEdit for
   * directly since a section drag isn't a field edit. */
  function beginSectionDragUndo() {
    sectionDragUndoSnapshotRef.current = state;
  }

  function finishSectionDragUndo() {
    const snapshot = sectionDragUndoSnapshotRef.current;
    sectionDragUndoSnapshotRef.current = null;
    if (snapshot && hasUndoableChange(snapshot, state)) {
      recordUndoSnapshot(snapshot);
    }
  }

  function undoLastChange() {
    if (!undoState) {
      return;
    }
    // Derive the revision from the live state, not the snapshot: undoState is an
    // older snapshot whose revision is behind current, so basing it on the
    // snapshot could reuse (or move backwards past) a revision already shown and
    // silently suppress the toast.
    setState((current) => ({
      ...undoState,
      ...withMessage(current, 'Restored the previous change.'),
    }));
    setUndoState(null);
  }

  /** Drops the undo snapshot and both in-progress edit brackets. Must be
   * called whenever the state being edited is swapped out for an unrelated
   * one (switching designs, importing a file) — otherwise Undo would
   * restore state from whatever was being edited before the swap. */
  function clearUndoHistory() {
    setUndoState(null);
    fieldEditUndoSnapshotRef.current = null;
    sectionDragUndoSnapshotRef.current = null;
  }

  return {
    undoState,
    recordUndoSnapshot,
    hasUndoableChange,
    beginFieldEdit,
    finishFieldEdit,
    beginSectionDragUndo,
    finishSectionDragUndo,
    undoLastChange,
    clearUndoHistory,
  };
}
