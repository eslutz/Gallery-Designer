import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  distanceBetween,
  getPointerId,
  isWallPanTarget,
  midpointBetween,
  normalizeWheelDelta,
  WALL_MOUSE_PAN_ID,
} from '../lib/pointerInput';
import {
  clampWallZoomCenter,
  clampWallZoomScale,
  getDefaultWallZoomState,
  getWallCanvasBaseViewBox,
  getWallZoomedViewBox,
  resolveWallPan,
  zoomWallStateAroundPoint,
  type WallViewBox,
  type WallZoomState,
} from '../lib/wallZoom';
import type { WallSection } from '../types';

/** Mirrors the cursor states App.tsx tracks; the hook only ever writes 'panning-wall'/'idle'. */
export type CursorInteraction = 'idle' | 'dragging-piece' | 'dragging-section' | 'panning-wall';

interface WallZoomGesture {
  pointers: Map<number, { clientX: number; clientY: number }>;
  startDistance: number;
  startScale: number;
}

interface WallPanState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCenterX: number;
  startCenterY: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
}

export interface UseWallZoomPanParams {
  sections: WallSection[];
  /** Same setter shape as React's `useState` dispatch for cursorInteraction, owned by App.tsx. */
  onInteractionChange: Dispatch<SetStateAction<CursorInteraction>>;
  /** True while a piece or section drag (owned by App.tsx's drag cluster) is in progress. */
  hasBlockingDrag: () => boolean;
  startSuppressingTextSelection: () => void;
  stopSuppressingTextSelection: () => void;
}

/**
 * Owns wall canvas zoom/pan: the `wallZoom` view state, the pointer/wheel machinery that
 * drives it, and the client<->SVG coordinate conversion helpers the drag/drop code
 * (still in App.tsx) relies on for every placement calculation.
 *
 * `cursorInteraction` itself stays in App.tsx (it's shared with the drag cluster); this
 * hook only ever nudges it via `onInteractionChange`, matching what `fitWallZoom`,
 * `startWallPan`, `finishWallPan`, and `finishWallMousePan` did before extraction.
 */
export function useWallZoomPan({
  sections,
  onInteractionChange,
  hasBlockingDrag,
  startSuppressingTextSelection,
  stopSuppressingTextSelection,
}: UseWallZoomPanParams) {
  const wallBaseViewBox = useMemo(() => getWallCanvasBaseViewBox(sections), [sections]);
  const [wallZoom, setWallZoom] = useState<WallZoomState>(() =>
    getDefaultWallZoomState(wallBaseViewBox),
  );
  const wallViewBox = useMemo(
    () => getWallZoomedViewBox(wallBaseViewBox, wallZoom),
    [wallBaseViewBox, wallZoom],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const wallDisplayRef = useRef<HTMLDivElement | null>(null);
  const wallBaseViewBoxRef = useRef<WallViewBox | null>(null);
  const wallZoomRef = useRef(wallZoom);
  const wallViewBoxRef = useRef<WallViewBox | null>(null);
  const wallZoomGestureRef = useRef<WallZoomGesture | null>(null);
  const wallPanRef = useRef<WallPanState | null>(null);
  const spacePressedRef = useRef(false);

  useLayoutEffect(() => {
    wallBaseViewBoxRef.current = wallBaseViewBox;
    wallZoomRef.current = wallZoom;
    wallViewBoxRef.current = wallViewBox;
  });

  // Keeps the pan center glued to the wall's midpoint whenever the base viewbox changes
  // (e.g. a section is added/removed) while the user is at the default 1x scale.
  useEffect(() => {
    setWallZoom((current) =>
      current.scale === 1
        ? {
            ...current,
            centerX: wallBaseViewBox.x + wallBaseViewBox.width / 2,
            centerY: wallBaseViewBox.y + wallBaseViewBox.height / 2,
          }
        : current,
    );
  }, [wallBaseViewBox.x, wallBaseViewBox.y, wallBaseViewBox.width, wallBaseViewBox.height]);

  function clientPointToSvgFromViewBox(event: {
    clientX: number;
    clientY: number;
  }): DOMPoint | null {
    const svg = svgRef.current;
    const viewBox = wallViewBoxRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!svg || !viewBox || !rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height,
    } as DOMPoint;
  }

  function clientPointToSvg(event: { clientX: number; clientY: number }): DOMPoint | null {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return null;
    }

    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    if (typeof svg.getScreenCTM !== 'function') {
      return clientPointToSvgFromViewBox(event);
    }
    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return clientPointToSvgFromViewBox(event);
    }
    const inverse = matrix.inverse();
    return {
      x: event.clientX * inverse.a + event.clientY * inverse.c + inverse.e,
      y: event.clientX * inverse.b + event.clientY * inverse.d + inverse.f,
    } as DOMPoint;
  }

  function svgPointToClient(point: { x: number; y: number }): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg || typeof svg.getScreenCTM !== 'function') {
      return null;
    }
    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return null;
    }
    return {
      x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f,
    };
  }

  function fitWallZoom() {
    setWallZoom(getDefaultWallZoomState(wallBaseViewBox));
    wallZoomGestureRef.current = null;
    wallPanRef.current = null;
    onInteractionChange((current) => (current === 'panning-wall' ? 'idle' : current));
  }

  function zoomWallBy(factor: number) {
    setWallZoom((current) =>
      zoomWallStateAroundPoint(
        wallBaseViewBox,
        getWallZoomedViewBox(wallBaseViewBox, current),
        clampWallZoomScale(current.scale * factor),
      ),
    );
  }

  function zoomWallAroundClientPoint(
    nextScale: number,
    focusPoint?: { clientX: number; clientY: number },
  ) {
    const focusSvgPoint = focusPoint ? clientPointToSvg(focusPoint) : null;
    setWallZoom((current) =>
      zoomWallStateAroundPoint(
        wallBaseViewBox,
        getWallZoomedViewBox(wallBaseViewBox, current),
        clampWallZoomScale(nextScale),
        focusSvgPoint,
      ),
    );
  }

  function startWallPan(
    event: { clientX: number; clientY: number },
    pointerId: number,
    rect: DOMRect,
  ) {
    const currentZoom = wallZoomRef.current;
    const currentViewBox = wallViewBoxRef.current;
    if (!currentViewBox) {
      return;
    }

    wallPanRef.current = {
      pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCenterX: currentZoom.centerX,
      startCenterY: currentZoom.centerY,
      viewBoxWidth: currentViewBox.width,
      viewBoxHeight: currentViewBox.height,
      canvasWidthPx: rect.width,
      canvasHeightPx: rect.height,
    };
    onInteractionChange('panning-wall');
    startSuppressingTextSelection();
  }

  function updateWallPan(
    event: Pick<PointerEvent, 'clientX' | 'clientY'> & { pointerId?: number },
  ): boolean {
    const pan = wallPanRef.current;
    if (
      !pan ||
      getPointerId(event) !== pan.pointerId ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    ) {
      return false;
    }

    const deltaX = event.clientX - pan.startClientX;
    const deltaY = event.clientY - pan.startClientY;
    const nextCenter = clampWallZoomCenter(
      wallBaseViewBox,
      pan.viewBoxWidth,
      pan.viewBoxHeight,
      pan.startCenterX - (deltaX / pan.canvasWidthPx) * pan.viewBoxWidth,
      pan.startCenterY - (deltaY / pan.canvasHeightPx) * pan.viewBoxHeight,
    );

    setWallZoom((current) => ({
      ...current,
      centerX: nextCenter.centerX,
      centerY: nextCenter.centerY,
    }));
    return true;
  }

  function updateWallMousePan(event: MouseEvent): boolean {
    const pan = wallPanRef.current;
    if (pan?.pointerId !== WALL_MOUSE_PAN_ID) {
      return false;
    }
    return updateWallPan({
      pointerId: WALL_MOUSE_PAN_ID,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  function updateWallZoomGesture(
    event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'> & { pointerType?: string },
  ): boolean {
    const gesture = wallZoomGestureRef.current;
    if (!gesture || gesture.pointers.size < 2) {
      return false;
    }

    if (event.pointerType && event.pointerType !== 'touch') {
      return false;
    }

    if (!gesture.pointers.has(event.pointerId)) {
      return false;
    }

    gesture.pointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });

    const points = [...gesture.pointers.values()].slice(0, 2);
    if (points.length < 2) {
      return false;
    }

    const currentDistance = distanceBetween(points[0], points[1]);
    if (currentDistance <= 0 || gesture.startScale <= 0 || gesture.startDistance <= 0) {
      return false;
    }

    const focusPoint = midpointBetween(points[0], points[1]);
    const nextScale = clampWallZoomScale(
      gesture.startScale * (currentDistance / gesture.startDistance),
    );
    zoomWallAroundClientPoint(nextScale, focusPoint);
    return true;
  }

  function finishWallZoomGesture(event?: { pointerId?: number }) {
    const gesture = wallZoomGestureRef.current;
    if (!gesture) {
      return;
    }

    if (event && typeof event.pointerId === 'number') {
      gesture.pointers.delete(event.pointerId);
    }

    if (gesture.pointers.size < 2) {
      wallZoomGestureRef.current = null;
    }
  }

  function finishWallPan(event?: { pointerId?: number }) {
    const pan = wallPanRef.current;
    if (!pan) {
      return;
    }
    if (!event || getPointerId(event) === pan.pointerId) {
      wallPanRef.current = null;
      onInteractionChange('idle');
      stopSuppressingTextSelection();
    }
  }

  function finishWallMousePan() {
    const pan = wallPanRef.current;
    if (!pan || pan.pointerId !== WALL_MOUSE_PAN_ID) {
      return;
    }
    wallPanRef.current = null;
    onInteractionChange('idle');
    stopSuppressingTextSelection();
  }

  /** @returns true when the wall absorbed some of the scroll, i.e. the view actually moved. */
  function panWallByWheel(event: { deltaMode: number; deltaX: number; deltaY: number }): boolean {
    const rect = svgRef.current?.getBoundingClientRect();
    const baseViewBox = wallBaseViewBoxRef.current;
    if (!rect || rect.width <= 0 || rect.height <= 0 || !baseViewBox) {
      return false;
    }

    // Resolved up front rather than inside the updater: the caller needs to know
    // whether this pan moved anything *before* deciding to preventDefault, and a
    // wheel event can only be captured or released as a whole.
    const current = wallZoomRef.current;
    const currentViewBox = getWallZoomedViewBox(baseViewBox, current);
    const delta = normalizeWheelDelta(event);
    const pan = resolveWallPan(
      baseViewBox,
      currentViewBox.width,
      currentViewBox.height,
      current.centerX,
      current.centerY,
      current.centerX + (delta.x / rect.width) * currentViewBox.width,
      current.centerY + (delta.y / rect.height) * currentViewBox.height,
    );

    if (!pan.absorbed) {
      return false;
    }

    // Keep the ref in step with the write so back-to-back wheel events within a
    // single frame each resolve against the latest center instead of re-deciding
    // from a stale one.
    wallZoomRef.current = { ...current, centerX: pan.centerX, centerY: pan.centerY };
    setWallZoom((latest) => ({ ...latest, centerX: pan.centerX, centerY: pan.centerY }));
    return true;
  }

  /** @returns true when the wall consumed the wheel event and the caller should capture it. */
  function handleWallWheelInput(event: {
    altKey: boolean;
    clientX: number;
    clientY: number;
    ctrlKey: boolean;
    deltaMode: number;
    deltaX: number;
    deltaY: number;
    metaKey: boolean;
  }): boolean {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      // At fit scale there is nothing to pan, so the scroll belongs to whatever
      // container surrounds the canvas.
      if (wallZoomRef.current.scale <= 1) {
        return false;
      }
      return panWallByWheel(event);
    }

    const baseViewBox = wallBaseViewBoxRef.current;
    if (!baseViewBox) {
      return false;
    }

    // Modifier+wheel always zooms, at every scale — releasing it would let the
    // browser page-zoom instead.
    const factor = Math.exp(-event.deltaY * 0.0015);
    const focusSvgPoint = clientPointToSvg(event);
    setWallZoom((current) =>
      zoomWallStateAroundPoint(
        baseViewBox,
        getWallZoomedViewBox(baseViewBox, current),
        clampWallZoomScale(current.scale * factor),
        focusSvgPoint,
      ),
    );
    return true;
  }

  // Freshness indirection for the two window-level effects below: both effects mount once
  // ([] deps) so they can't close over per-render functions directly without going stale
  // (updateWallPan and handleWallWheelInput read closure state, e.g. wallBaseViewBox, that
  // changes across renders). This mirrors App.tsx's own `interactionHandlersRef` pattern,
  // scoped down to just the handlers these two effects need.
  const wallHandlersRef = useRef({ updateWallPan, finishWallPan, handleWallWheelInput });
  useLayoutEffect(() => {
    wallHandlersRef.current = { updateWallPan, finishWallPan, handleWallWheelInput };
  });

  // Capture-phase pan start: begins a wall pan on middle-click or space+drag (mouse), or
  // on a single touch when already zoomed in, as long as no piece/section drag owns the
  // pointer. Registered on window (capture for pointerdown/mousedown) so it sees the event
  // before the SVG's own handlers.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const canvas = svg;

    function handleNativePointerDown(event: PointerEvent) {
      const wantsPan =
        event.pointerType === 'touch'
          ? wallZoomRef.current.scale > 1
          : event.button === 1 || spacePressedRef.current;
      if (
        !wantsPan ||
        hasBlockingDrag() ||
        wallPanRef.current ||
        !isWallPanTarget(event.target) ||
        !Number.isFinite(event.clientX) ||
        !Number.isFinite(event.clientY)
      ) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      event.preventDefault();
      startWallPan(event, getPointerId(event), rect);
    }

    function handleNativePointerMove(event: PointerEvent) {
      if (wallHandlersRef.current.updateWallPan(event)) {
        event.preventDefault();
      }
    }

    function handleNativePointerUp(event: PointerEvent) {
      wallHandlersRef.current.finishWallPan(event);
    }

    function handleNativeMouseDown(event: MouseEvent) {
      const wantsPan = event.button === 1 || spacePressedRef.current;
      if (
        !wantsPan ||
        hasBlockingDrag() ||
        wallPanRef.current ||
        !isWallPanTarget(event.target) ||
        !Number.isFinite(event.clientX) ||
        !Number.isFinite(event.clientY)
      ) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      event.preventDefault();
      startWallPan(event, WALL_MOUSE_PAN_ID, rect);
    }

    window.addEventListener('pointerdown', handleNativePointerDown, true);
    window.addEventListener('pointermove', handleNativePointerMove);
    window.addEventListener('pointerup', handleNativePointerUp);
    window.addEventListener('mousedown', handleNativeMouseDown, true);
    return () => {
      window.removeEventListener('pointerdown', handleNativePointerDown, true);
      window.removeEventListener('pointermove', handleNativePointerMove);
      window.removeEventListener('pointerup', handleNativePointerUp);
      window.removeEventListener('mousedown', handleNativeMouseDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/Cmd/Alt+wheel zooms around the pointer; a plain wheel pans the canvas.
  useEffect(() => {
    const display = wallDisplayRef.current;
    if (!display) {
      return;
    }
    const displayPanel = display;

    function handleDisplayWheel(event: WheelEvent) {
      if (!(event.target instanceof Node) || !displayPanel.contains(event.target)) {
        return;
      }

      // Capture only what the wall actually used. Anything it declines — a plain
      // wheel at fit scale, or a pan already pinned against the wall bounds —
      // stays available to the surrounding scroll container.
      if (!wallHandlersRef.current.handleWallWheelInput(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    displayPanel.addEventListener('wheel', handleDisplayWheel, { passive: false });
    return () => displayPanel.removeEventListener('wheel', handleDisplayWheel);
  }, []);

  return {
    wallZoom,
    setWallZoom,
    wallBaseViewBox,
    wallViewBox,
    svgRef,
    wallDisplayRef,
    wallPanRef,
    wallZoomGestureRef,
    spacePressedRef,
    fitWallZoom,
    zoomWallBy,
    startWallPan,
    updateWallPan,
    updateWallMousePan,
    updateWallZoomGesture,
    finishWallZoomGesture,
    finishWallPan,
    finishWallMousePan,
    handleWallWheelInput,
    clientPointToSvg,
    svgPointToClient,
  };
}
