import {
  ChevronDown,
  Copy,
  Maximize2,
  Move,
  Plus,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AdvancedDrawer } from './components/AdvancedDrawer';
import { formatCount } from './components/AutoPlacementFailureDetails';
import { BrandLogo } from './components/BrandLogo';
import { CollapsiblePanel } from './components/CollapsiblePanel';
import { HookControls } from './components/HookControls';
import { TooltipIconButton } from './components/InfoTooltip';
import { MeasurementsTable } from './components/MeasurementsTable';
import { MessageToast } from './components/MessageToast';
import { NumberField } from './components/NumberField';
import { PlacementSettingsDrawer } from './components/PlacementSettingsDrawer';
import { StagingTray } from './components/StagingTray';
import { WallCanvas } from './components/WallCanvas';
import {
  WallDragPreviewOverlay,
  type DragItemKind,
  type WallDragPreview,
} from './components/WallDragPreviewOverlay';
import { useAlignmentGuides } from './hooks/useAlignmentGuides';
import { useStatusToast } from './hooks/useStatusToast';
import { useUndoHistory } from './hooks/useUndoHistory';
import { useWallZoomPan, type CursorInteraction } from './hooks/useWallZoomPan';
import { autoPlacePieces } from './lib/autoPlace';
import { parseDesignFile, serializeDesignFile } from './lib/designFile';
import { downloadPdf, downloadPng, type ExportDesignInput } from './lib/exportDesign';
import {
  defaultState,
  getSelectedFeatureId,
  getSelectedPieceIds,
  loadState,
  pieceSelection,
  STORAGE_KEY,
  toPersistedState,
  withMessage,
  type GalleryState,
} from './lib/galleryState';
import {
  distanceBetween,
  getPointerId,
  isTextEntryTarget,
  isWallPanTarget,
  tryCapturePointer,
  POINTER_DRAG_THRESHOLD_PX,
  WALL_MOUSE_PAN_ID,
} from './lib/pointerInput';
import { buildMeasurementInstructions } from './lib/measurements';
import {
  getGroupBounds,
  getPieceIdsIntersectingRect,
  normalizeSelectionRect,
  shouldKeepSelection,
  translatePlacementGroup,
} from './lib/multiSelection';
import {
  getPlacementIssues,
  getUnplacedPieceIssues,
  reassignPlacementsToContainingSections,
  reassignPlacementToContainingSection,
  type Rect,
} from './lib/placement';
import {
  applyFeaturePlacementFeaturesWithMetadata,
  applyPlacementFeaturesWithMetadata,
  applyPlacementGroupFeaturesWithMetadata,
  type AlignmentGuide,
} from './lib/snapping';
import { formatMeasurement, roundToPrecision } from './lib/units';
import {
  applyWallSectionFeatures,
  getNextSectionId,
  getSectionOffsetY,
  getSectionById,
  getSectionOffsetX,
  getWallBounds,
  getWallLayout,
  moveWallSection,
  normalizeWallSections,
  validateWallSections,
} from './lib/wall';
import { getDefaultWallZoomState, getWallCanvasBaseViewBox } from './lib/wallZoom';
import {
  isPlacedWallFeature,
  movePlacedFeaturesWithWallSection,
  resolveWallFeatureRule,
} from './lib/wallFeatures';
import type {
  ArtPiece,
  AutoPlacementSettings,
  EditorFeatures,
  Placement,
  Unit,
  UndoableChangeOptions,
  WallFeature,
  WallSection,
} from './types';

const DRAG_PREVIEW_SCALE_PX_PER_IN = 3;
const SUPPRESS_TEXT_SELECTION_CLASS = 'suppress-text-selection';
const ZOOM_BUTTON_FACTOR = 1.2;

interface DragState {
  itemKind: DragItemKind;
  itemId: string;
  source: 'staging' | 'wall';
  startPoint: DOMPoint | null;
  startPlacement: Placement | null;
  latestPlacement: Placement | null;
  startFeature: WallFeature | null;
  latestFeature: WallFeature | null;
  previewWidthPx: number;
  previewHeightPx: number;
  pieceIds: string[];
  startPlacements: Placement[];
  latestPlacements: Placement[];
  latestGuides: AlignmentGuide[];
  startClientX: number;
  startClientY: number;
  hasMoved: boolean;
}

interface MarqueeState {
  startPoint: DOMPoint;
  startClientX: number;
  startClientY: number;
  additive: boolean;
  initialPieceIds: string[];
  hasMoved: boolean;
}

interface SectionDragState {
  sectionId: string;
  startPoint: DOMPoint;
  startXIn: number;
  startYIn: number;
}

interface DragPreviewState {
  wallDragPreview: WallDragPreview | null;
  groupDragPreview: readonly Placement[];
}

type DragPreviewAction =
  | { type: 'set-wall-preview'; preview: WallDragPreview | null }
  | { type: 'set-group-preview'; placements: readonly Placement[] };

// Shared idle sentinel: frozen so a stray mutation can't corrupt every consumer
// that holds this same instance.
const EMPTY_PLACEMENTS: readonly Placement[] = Object.freeze([]);
const DRAG_PREVIEW_IDLE: DragPreviewState = {
  wallDragPreview: null,
  groupDragPreview: EMPTY_PLACEMENTS,
};

function dragPreviewReducer(state: DragPreviewState, action: DragPreviewAction): DragPreviewState {
  switch (action.type) {
    case 'set-wall-preview':
      return { ...state, wallDragPreview: action.preview };
    case 'set-group-preview':
      return { ...state, groupDragPreview: action.placements };
  }
}

export default function App() {
  const [state, setState] = useState<GalleryState>(() => loadState());
  const {
    autoPlacementFailure,
    setAutoPlacementFailure,
    toastVisible,
    toastDetails,
    dismissToast,
  } = useStatusToast({
    message: state.message,
    messageTone: state.messageTone,
    messageRevision: state.messageRevision,
    unit: state.unit,
  });
  // Section selection is deliberately independent from `state.selection`
  // (pieces/feature): it can stay active while a piece or feature is
  // selected or cleared. See the `Selection` type in lib/galleryState.ts.
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [dragPreview, dispatchDragPreview] = useReducer(dragPreviewReducer, DRAG_PREVIEW_IDLE);
  const { wallDragPreview, groupDragPreview } = dragPreview;
  const setWallDragPreview = useCallback((preview: WallDragPreview | null) => {
    dispatchDragPreview({ type: 'set-wall-preview', preview });
  }, []);
  const setGroupDragPreview = useCallback((placements: Placement[]) => {
    dispatchDragPreview({ type: 'set-group-preview', placements });
  }, []);
  const [selectionMarquee, setSelectionMarquee] = useState<Rect | null>(null);
  const { visibleAlignmentGuides, showAlignmentGuides, lingerAlignmentGuides } = useAlignmentGuides(
    state.features.showAlignmentGuides,
  );
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const [advancedDrawerOpen, setAdvancedDrawerOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState(defaultState.sections[0]?.id ?? '');
  const [autoPlacementVariantIndex, setAutoPlacementVariantIndex] = useState(0);
  const [cursorInteraction, setCursorInteraction] = useState<CursorInteraction>('idle');
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const editorColumnRef = useRef<HTMLElement | null>(null);
  const clearMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const latestStateRef = useRef(state);
  const {
    undoState,
    recordUndoSnapshot,
    beginFieldEdit,
    finishFieldEdit,
    beginSectionDragUndo,
    finishSectionDragUndo,
    undoLastChange,
  } = useUndoHistory({ state, setState });
  const dragRef = useRef<DragState | null>(null);
  const marqueeRef = useRef<MarqueeState | null>(null);
  const sectionDragRef = useRef<SectionDragState | null>(null);
  const interactionHandlersRef = useRef<{
    updateWallZoomGesture: (event: PointerEvent) => boolean;
    updateWallPan: (
      event: Pick<PointerEvent, 'clientX' | 'clientY'> & { pointerId?: number },
    ) => boolean;
    updateWallMousePan: (event: MouseEvent) => boolean;
    updateSectionDrag: (event: { clientX: number; clientY: number }) => boolean;
    updateMarquee: (event: { clientX: number; clientY: number }) => boolean;
    updatePointerDrag: (event: { clientX: number; clientY: number }) => void;
    finishMarquee: () => void;
    finishPieceDrag: (event?: { clientX: number; clientY: number; pointerId?: number }) => void;
    finishWallPan: (event?: { pointerId?: number }) => void;
    finishWallMousePan: () => void;
    handleWallWheelInput: (event: {
      altKey: boolean;
      clientX: number;
      clientY: number;
      ctrlKey: boolean;
      deltaMode: number;
      deltaX: number;
      deltaY: number;
      metaKey: boolean;
    }) => void;
    handleCanvasKeyDown: (event: KeyboardEvent) => void;
  } | null>(null);

  const {
    wallZoom,
    setWallZoom,
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
  } = useWallZoomPan({
    sections: state.sections,
    onInteractionChange: setCursorInteraction,
    hasBlockingDrag: () => Boolean(dragRef.current) || Boolean(sectionDragRef.current),
    startSuppressingTextSelection,
    stopSuppressingTextSelection,
  });

  const wallIssues = useMemo(() => validateWallSections(state.sections), [state.sections]);
  const placementIssues = useMemo(
    () => getPlacementIssues(state.sections, state.pieces, state.placements),
    [state.sections, state.pieces, state.placements],
  );
  const unplacedIssues = useMemo(
    () => getUnplacedPieceIssues(state.pieces, state.placements),
    [state.pieces, state.placements],
  );
  const allIssues = useMemo(
    () => [...new Set([...wallIssues, ...placementIssues, ...unplacedIssues])],
    [wallIssues, placementIssues, unplacedIssues],
  );
  const measurements = useMemo(
    () =>
      buildMeasurementInstructions(
        state.sections,
        state.pieces,
        state.placements,
        state.unit,
        state.features.measurementReferenceMode,
      ),
    [
      state.sections,
      state.pieces,
      state.placements,
      state.unit,
      state.features.measurementReferenceMode,
    ],
  );
  const selectedPieceIds = getSelectedPieceIds(state.selection);
  const selectedFeatureId = getSelectedFeatureId(state.selection);
  // Derived, not stored: a piece row is "expanded" exactly when it is the
  // sole selected piece. This deliberately means selecting a feature or
  // section, running auto-place, multi-selecting, importing a design, or
  // clearing selection now all collapse any previously-expanded piece row,
  // since none of those leave exactly one piece selected.
  const expandedPieceId = selectedPieceIds.length === 1 ? selectedPieceIds[0] : '';
  const activeSelectedPieceId = selectedPieceIds.at(-1) ?? '';
  const selectedPiece = state.pieces.find((piece) => piece.id === activeSelectedPieceId);
  const selectedPlacement = state.placements.find(
    (placement) => placement.pieceId === activeSelectedPieceId,
  );
  const selectedFeature = state.autoPlacementSettings.wallFeatures.find(
    (feature) => feature.id === selectedFeatureId && isPlacedWallFeature(feature),
  );
  const readyToExport = allIssues.length === 0 && state.pieces.length > 0;

  useLayoutEffect(() => {
    interactionHandlersRef.current = {
      updateWallZoomGesture,
      updateWallPan,
      updateWallMousePan,
      updateSectionDrag,
      updateMarquee,
      updatePointerDrag,
      finishMarquee,
      finishPieceDrag,
      finishWallPan,
      finishWallMousePan,
      handleWallWheelInput,
      handleCanvasKeyDown,
    };
  });

  useEffect(() => {
    const workspace = workspaceRef.current;
    const editorColumn = editorColumnRef.current;
    if (!workspace || !editorColumn) {
      return;
    }
    const scrollTarget = editorColumn;

    function handleWorkspaceWheel(event: WheelEvent) {
      if (event.target !== workspace) {
        return;
      }

      event.preventDefault();
      scrollTarget.scrollBy({
        left: event.deltaX,
        top: event.deltaY,
        behavior: 'auto',
      });
    }

    workspace.addEventListener('wheel', handleWorkspaceWheel, { passive: false });
    return () => workspace.removeEventListener('wheel', handleWorkspaceWheel);
  }, []);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(state)));
    } catch {
      // Persistence is a convenience; a full or unavailable store must not break editing.
    }
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.palette = state.applicationTheme;
  }, [state.applicationTheme]);

  useEffect(() => {
    const darkScheme = window.matchMedia?.('(prefers-color-scheme: dark)');

    function applyTheme() {
      const resolvedTheme =
        state.themeMode === 'system' ? (darkScheme?.matches ? 'dark' : 'light') : state.themeMode;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    }

    applyTheme();
    darkScheme?.addEventListener?.('change', applyTheme);
    return () => darkScheme?.removeEventListener?.('change', applyTheme);
  }, [state.themeMode]);

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent) {
      const handlers = interactionHandlersRef.current;
      if (!handlers) {
        return;
      }
      if (handlers.updateWallZoomGesture(event)) {
        event.preventDefault();
        return;
      }
      if (handlers.updateWallPan(event)) {
        event.preventDefault();
        return;
      }
      if (handlers.updateSectionDrag(event)) {
        event.preventDefault();
        return;
      }
      if (handlers.updateMarquee(event)) {
        event.preventDefault();
        return;
      }
      const drag = dragRef.current;
      if (drag) {
        event.preventDefault();
        handlers.updatePointerDrag(event);
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      interactionHandlersRef.current?.finishPieceDrag(event);
      interactionHandlersRef.current?.finishWallPan(event);
      interactionHandlersRef.current?.finishMarquee();
    }

    function handleWindowMouseMove(event: MouseEvent) {
      if (interactionHandlersRef.current?.updateSectionDrag(event)) {
        event.preventDefault();
        return;
      }
      if (interactionHandlersRef.current?.updateWallMousePan(event)) {
        event.preventDefault();
      }
    }

    function handleWindowMouseUp(event: MouseEvent) {
      interactionHandlersRef.current?.finishPieceDrag(event);
      interactionHandlersRef.current?.finishWallMousePan();
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTextEntryTarget(event.target)) {
        spacePressedRef.current = true;
      }
      interactionHandlersRef.current?.handleCanvasKeyDown(event);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false;
      }
    };
    const handleBlur = () => {
      spacePressedRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [spacePressedRef]);

  useEffect(() => {
    if (!clearMenuOpen) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      const menu = clearMenuRef.current;
      if (!menu || !(event.target instanceof Node) || menu.contains(event.target)) {
        return;
      }
      setClearMenuOpen(false);
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown);
  }, [clearMenuOpen]);

  function selectPiece(pieceId: string) {
    setState((current) => ({ ...current, selection: { kind: 'pieces', pieceIds: [pieceId] } }));
  }

  function togglePieceSelection(pieceId: string) {
    setState((current) => {
      const currentIds = getSelectedPieceIds(current.selection);
      const selected = currentIds.includes(pieceId);
      const nextSelectedPieceIds = selected
        ? currentIds.filter((candidate) => candidate !== pieceId)
        : [...currentIds, pieceId];
      return {
        ...current,
        selection: pieceSelection(nextSelectedPieceIds),
      };
    });
  }

  function handlePieceRowSelection(pieceId: string, options?: { additive?: boolean }) {
    if (options?.additive) {
      togglePieceSelection(pieceId);
      return;
    }
    selectPiece(pieceId);
  }

  function selectFeature(featureId: string) {
    setState((current) => ({ ...current, selection: { kind: 'feature', featureId } }));
  }

  function toggleFeatureSelection(featureId: string) {
    setState((current) => ({
      ...current,
      selection:
        current.selection.kind === 'feature' && current.selection.featureId === featureId
          ? { kind: 'none' }
          : { kind: 'feature', featureId },
    }));
  }

  function selectSection(sectionId: string) {
    setState((current) =>
      current.selection.kind === 'feature' ? { ...current, selection: { kind: 'none' } } : current,
    );
    setSelectedSectionId(sectionId);
    setExpandedSectionId(sectionId);
  }

  function toggleSectionSelection(sectionId: string) {
    const next = selectedSectionId === sectionId ? '' : sectionId;
    setState((current) =>
      current.selection.kind === 'feature' ? { ...current, selection: { kind: 'none' } } : current,
    );
    setSelectedSectionId(next);
    setExpandedSectionId(next);
  }

  function clearSelection() {
    setSelectedSectionId('');
    setExpandedSectionId('');
    setState((current) => ({ ...current, selection: { kind: 'none' } }));
  }

  function updateUnit(unit: Unit) {
    recordUndoSnapshot();
    setState((current) => ({ ...current, unit }));
  }

  function handlePagePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest('.wall-canvas')) {
      return;
    }
    if (shouldKeepSelection(event.target)) {
      return;
    }
    clearSelection();
  }

  function updateSection(sectionId: string, patch: Partial<WallSection>) {
    setState((current) => {
      const nextSections = normalizeWallSections(current.sections).map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      );

      return {
        ...current,
        sections: nextSections,
        placements: current.placements.filter((placement) =>
          current.pieces.some((piece) => piece.id === placement.pieceId),
        ),
      };
    });
  }

  function addSection() {
    recordUndoSnapshot();
    // Computed outside the updater: it must be pure, and StrictMode
    // double-invokes it, so the section id (and the setSelectedSectionId/
    // setExpandedSectionId calls that depend on it) cannot be decided inside.
    const normalizedSections = normalizeWallSections(latestStateRef.current.sections);
    const previousSection = normalizedSections.at(-1);
    const sectionId = getNextSectionId(normalizedSections);
    const index = normalizedSections.length + 1;
    setState((current) => ({
      ...current,
      sections: [
        ...normalizeWallSections(current.sections),
        {
          id: sectionId,
          name: `Section ${index}`,
          widthIn: previousSection?.widthIn ?? 96,
          heightIn: previousSection?.heightIn ?? 84,
          xIn: previousSection ? (previousSection.xIn ?? 0) + previousSection.widthIn : 0,
          yIn: previousSection?.yIn ?? 0,
        },
      ],
    }));
    setExpandedSectionId(sectionId);
    setSelectedSectionId(sectionId);
  }

  function removeSection(sectionId: string) {
    if (selectedSectionId === sectionId) {
      setSelectedSectionId('');
    }
    if (state.sections.length > 1) {
      recordUndoSnapshot();
    }
    setState((current) => {
      if (current.sections.length === 1) {
        return {
          ...current,
          ...withMessage(current, 'At least one wall section is required.', 'error'),
        };
      }
      const nextSections = normalizeWallSections(current.sections).filter(
        (section) => section.id !== sectionId,
      );
      const fallbackSectionId = nextSections[0].id;
      return {
        ...current,
        sections: nextSections,
        placements: current.placements.map((placement) =>
          placement.sectionId === sectionId
            ? { ...placement, sectionId: fallbackSectionId }
            : placement,
        ),
      };
    });
  }

  function addPiece() {
    recordUndoSnapshot();
    setState((current) => {
      const index = current.pieces.length + 1;
      const piece = {
        id: `piece-${Date.now()}-${index}`,
        label: `Piece ${index}`,
        widthIn: 16,
        heightIn: 20,
      };
      return {
        ...current,
        pieces: [...current.pieces, piece],
        selection: { kind: 'pieces', pieceIds: [piece.id] },
      };
    });
  }

  function duplicatePiece(pieceId: string) {
    recordUndoSnapshot();
    setState((current) => {
      const source = current.pieces.find((piece) => piece.id === pieceId);
      if (!source) {
        return current;
      }
      const duplicate = {
        ...source,
        id: `piece-${Date.now()}-${current.pieces.length + 1}`,
        label: `${source.label} copy`,
        hookSpec: source.hookSpec ? { ...source.hookSpec } : undefined,
      };
      return {
        ...current,
        pieces: [...current.pieces, duplicate],
        selection: { kind: 'pieces', pieceIds: [duplicate.id] },
        ...withMessage(current, `Duplicated ${source.label}.`),
      };
    });
  }

  function updatePiece(pieceId: string, patch: Partial<ArtPiece>) {
    setState((current) => ({
      ...current,
      pieces: current.pieces.map((piece) =>
        piece.id === pieceId ? { ...piece, ...patch } : piece,
      ),
      placements: current.placements.map((placement) => {
        if (placement.pieceId !== pieceId) {
          return placement;
        }
        return placement;
      }),
    }));
  }

  function removePiece(pieceId: string) {
    recordUndoSnapshot();
    setState((current) => {
      const nextPieces = current.pieces.filter((piece) => piece.id !== pieceId);
      const nextSelectedPieceIds = getSelectedPieceIds(current.selection).filter(
        (candidate) => candidate !== pieceId,
      );
      return {
        ...current,
        pieces: nextPieces,
        placements: current.placements.filter((placement) => placement.pieceId !== pieceId),
        selection: pieceSelection(nextSelectedPieceIds),
      };
    });
  }

  function applyFeatures(current: GalleryState, placement: Placement): Placement {
    return applyFeaturesWithMetadata(current, placement).value;
  }

  function applyFeaturesWithMetadata(
    current: GalleryState,
    placement: Placement,
  ): { value: Placement; guides: AlignmentGuide[] } {
    const piece = current.pieces.find((candidate) => candidate.id === placement.pieceId);
    if (!piece) {
      return { value: placement, guides: [] };
    }
    return applyPlacementFeaturesWithMetadata({
      placement,
      piece,
      sections: current.sections,
      pieces: current.pieces,
      placements: current.placements,
      features: current.features,
      featureRects: current.autoPlacementSettings.wallFeatures,
    });
  }

  function applyFeatureFeatures(current: GalleryState, feature: WallFeature): WallFeature {
    return applyFeatureFeaturesWithMetadata(current, feature).value;
  }

  function applyFeatureFeaturesWithMetadata(
    current: GalleryState,
    feature: WallFeature,
  ): { value: WallFeature; guides: AlignmentGuide[] } {
    const snapped = applyFeaturePlacementFeaturesWithMetadata({
      feature,
      sections: current.sections,
      pieces: current.pieces,
      placements: current.placements,
      features: current.features,
      featureRects: current.autoPlacementSettings.wallFeatures,
    });
    return {
      value: {
        ...feature,
        ...snapped.value,
      },
      guides: snapped.guides,
    };
  }

  function placementsMatch(a: Placement, b: Placement): boolean {
    return (
      a.pieceId === b.pieceId &&
      a.sectionId === b.sectionId &&
      Math.abs(a.xIn - b.xIn) < 0.0001 &&
      Math.abs(a.yIn - b.yIn) < 0.0001
    );
  }

  function featuresMatch(a: WallFeature, b: WallFeature): boolean {
    return (
      a.id === b.id &&
      Math.abs(a.xIn - b.xIn) < 0.0001 &&
      Math.abs((a.yIn ?? 0) - (b.yIn ?? 0)) < 0.0001
    );
  }

  function commitPiecePlacement(proposedPlacement: Placement) {
    recordUndoSnapshot();
    const snapped = applyFeaturesWithMetadata(latestStateRef.current, proposedPlacement);
    const guides = placementsMatch(snapped.value, proposedPlacement) ? snapped.guides : [];
    setState((current) => {
      const section = getSectionById(current.sections, proposedPlacement.sectionId);
      const piece = current.pieces.find((candidate) => candidate.id === proposedPlacement.pieceId);
      if (!section) {
        return current;
      }
      const placement = piece
        ? reassignPlacementToContainingSection(
            current.sections,
            applyFeatures(current, proposedPlacement),
            piece,
          )
        : applyFeatures(current, proposedPlacement);
      const placementSection = getSectionById(current.sections, placement.sectionId);

      return {
        ...current,
        selection: { kind: 'pieces', pieceIds: [placement.pieceId] },
        placements: [
          ...current.placements.filter((candidate) => candidate.pieceId !== placement.pieceId),
          placement,
        ],
        ...withMessage(
          current,
          piece && placementSection
            ? `Placed ${piece.label} on ${placementSection.name}.`
            : 'Placed a piece on the wall.',
        ),
      };
    });
    if (guides.length > 0) {
      showAlignmentGuides(guides);
    }
    lingerAlignmentGuides();
  }

  function commitPiecePlacementGroup(
    proposedPlacements: Placement[],
    pieceIds: string[],
    guides: AlignmentGuide[] = [],
  ) {
    if (proposedPlacements.length === 0) {
      return;
    }
    recordUndoSnapshot();
    const movingIds = new Set(pieceIds);
    setState((current) => ({
      ...current,
      selection: pieceSelection(pieceIds),
      placements: [
        ...current.placements.filter((placement) => !movingIds.has(placement.pieceId)),
        ...proposedPlacements,
      ],
      ...withMessage(
        current,
        proposedPlacements.length === 1
          ? `Moved ${getPieceLabel(current, proposedPlacements[0].pieceId)} on the wall.`
          : `Moved ${proposedPlacements.length} art pieces as a group.`,
      ),
    }));
    showAlignmentGuides(guides);
  }

  function nudgePieceGroup(pieceIds: string[], deltaXIn: number, deltaYIn: number) {
    const proposedPlacements = translatePlacementGroup(
      state.sections,
      state.pieces,
      state.placements,
      pieceIds,
      deltaXIn,
      deltaYIn,
    );
    if (pieceIds.length === 1 && proposedPlacements[0]) {
      const proposedPlacement = proposedPlacements[0];
      recordUndoSnapshot();
      const snapped = applyFeaturesWithMetadata(
        {
          ...latestStateRef.current,
          features: {
            ...latestStateRef.current.features,
            snapToAlignment: false,
          },
        },
        proposedPlacement,
      );
      const guides = snapped.guides;
      setState((current) => ({
        ...current,
        selection: { kind: 'pieces', pieceIds: [proposedPlacement.pieceId] },
        placements: [
          ...current.placements.filter(
            (candidate) => candidate.pieceId !== proposedPlacement.pieceId,
          ),
          proposedPlacement,
        ],
        ...withMessage(
          current,
          `Moved ${getPieceLabel(current, proposedPlacement.pieceId)} on the wall.`,
        ),
      }));
      if (guides.length > 0) {
        showAlignmentGuides(guides);
      } else {
        showAlignmentGuides([]);
      }
      lingerAlignmentGuides();
      return;
    }
    const snapped = applyPlacementGroupFeaturesWithMetadata({
      proposedPlacements,
      movingPieceIds: pieceIds,
      sections: latestStateRef.current.sections,
      pieces: latestStateRef.current.pieces,
      placements: latestStateRef.current.placements,
      features: {
        ...latestStateRef.current.features,
        snapToGrid: false,
        snapToAlignment: false,
      },
      featureRects: latestStateRef.current.autoPlacementSettings.wallFeatures,
    });
    commitPiecePlacementGroup(snapped.value, pieceIds, snapped.guides);
    lingerAlignmentGuides();
  }

  function commitFeaturePlacement(proposedFeature: WallFeature) {
    recordUndoSnapshot();
    const snapped = applyFeatureFeaturesWithMetadata(latestStateRef.current, proposedFeature);
    const guides = featuresMatch(snapped.value, proposedFeature) ? snapped.guides : [];
    setState((current) => {
      const feature = current.autoPlacementSettings.wallFeatures.find(
        (candidate) => candidate.id === proposedFeature.id,
      );
      if (!feature) {
        return { ...current, selection: { kind: 'feature', featureId: proposedFeature.id } };
      }
      const placedFeature = {
        ...applyFeatureFeatures(current, { ...feature, ...proposedFeature, placed: true }),
        placed: true,
      };
      return {
        ...current,
        selection: { kind: 'feature', featureId: proposedFeature.id },
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: current.autoPlacementSettings.wallFeatures.map((candidate) =>
            candidate.id === placedFeature.id ? placedFeature : candidate,
          ),
        },
        ...withMessage(current, `Placed ${placedFeature.name} on the wall.`),
      };
    });
    if (guides.length > 0) {
      showAlignmentGuides(guides);
    }
    lingerAlignmentGuides();
  }

  function nudgeFeature(proposedFeature: WallFeature) {
    recordUndoSnapshot();
    const snapped = applyFeatureFeaturesWithMetadata(latestStateRef.current, proposedFeature);
    const guides = featuresMatch(snapped.value, proposedFeature) ? snapped.guides : [];
    setState((current) => {
      const feature = current.autoPlacementSettings.wallFeatures.find(
        (candidate) => candidate.id === proposedFeature.id,
      );
      if (!feature) {
        return { ...current, selection: { kind: 'feature', featureId: proposedFeature.id } };
      }
      const placedFeature = { ...feature, ...proposedFeature, placed: true };
      return {
        ...current,
        selection: { kind: 'feature', featureId: proposedFeature.id },
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: current.autoPlacementSettings.wallFeatures.map((candidate) =>
            candidate.id === placedFeature.id ? placedFeature : candidate,
          ),
        },
        ...withMessage(current, `Moved ${placedFeature.name} on the wall.`),
      };
    });
    if (guides.length > 0) {
      showAlignmentGuides(guides);
    } else {
      showAlignmentGuides([]);
    }
    lingerAlignmentGuides();
  }

  function clearPlacedArt() {
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      placements: [],
      selection: current.pieces[0]
        ? { kind: 'pieces', pieceIds: [current.pieces[0].id] }
        : { kind: 'none' },
      ...withMessage(current, 'Cleared placed art. All pieces returned to the staging tray.'),
    }));
  }

  function clearWallSections() {
    recordUndoSnapshot();
    setSelectedSectionId('');
    setState((current) => ({
      ...current,
      sections: [],
      placements: [],
      ...withMessage(
        current,
        'Cleared wall sections. Add at least one wall section before placing art.',
      ),
    }));
  }

  function clearWallFeatures() {
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      selection: current.selection.kind === 'feature' ? { kind: 'none' } : current.selection,
      autoPlacementSettings: {
        ...current.autoPlacementSettings,
        wallFeatures: [],
      },
      ...withMessage(current, 'Cleared furniture and wall features.'),
    }));
  }

  function resetEntireDesign() {
    const confirmed = window.confirm(
      'Reset the entire design? This will remove your wall sections, art pieces, placements, settings, and furniture/features.',
    );
    if (!confirmed) {
      return;
    }

    recordUndoSnapshot();
    setSelectedSectionId('');
    setState((current) => ({
      ...defaultState,
      sections: [],
      pieces: [],
      placements: [],
      features: { ...defaultState.features },
      autoPlacementSettings: {
        ...defaultState.autoPlacementSettings,
        context: { ...defaultState.autoPlacementSettings.context },
        wallFeatures: [],
      },
      selection: { kind: 'none' },
      ...withMessage(
        current,
        'Reset the entire design. Add wall sections and art pieces to start over.',
      ),
    }));
    setWallZoom(getDefaultWallZoomState(getWallCanvasBaseViewBox([])));
  }

  function runClearAction(action: () => void) {
    setClearMenuOpen(false);
    action();
  }

  function updateFeatures(patch: Partial<EditorFeatures>, options: UndoableChangeOptions = {}) {
    if (options.undoable !== false) {
      recordUndoSnapshot();
    }
    setState((current) => ({
      ...current,
      features: {
        ...current.features,
        ...patch,
      },
      ...withMessage(current, 'Updated snapping and buffer settings.'),
    }));
  }

  function updateAutoPlacementSettings(
    settings: AutoPlacementSettings,
    options: UndoableChangeOptions = {},
  ) {
    if (options.undoable !== false) {
      recordUndoSnapshot();
    }
    setState((current) => ({
      ...current,
      autoPlacementSettings: settings,
      ...withMessage(current, 'Updated auto-placement settings.'),
    }));
  }

  function removePlacement(pieceId: string) {
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      selection: { kind: 'pieces', pieceIds: [pieceId] },
      placements: current.placements.filter((placement) => placement.pieceId !== pieceId),
      ...withMessage(current, `Returned ${getPieceLabel(current, pieceId)} to the staging tray.`),
    }));
  }

  function removePlacementGroup(pieceIds: string[]) {
    if (pieceIds.length === 0) {
      return;
    }
    recordUndoSnapshot();
    const movingIds = new Set(pieceIds);
    setState((current) => ({
      ...current,
      selection: pieceSelection(pieceIds),
      placements: current.placements.filter((placement) => !movingIds.has(placement.pieceId)),
      ...withMessage(
        current,
        pieceIds.length === 1
          ? `Returned ${getPieceLabel(current, pieceIds[0])} to the staging tray.`
          : `Returned ${pieceIds.length} art pieces to the staging tray.`,
      ),
    }));
  }

  function removeFeaturePlacement(featureId: string) {
    recordUndoSnapshot();
    setState((current) => {
      const feature = current.autoPlacementSettings.wallFeatures.find(
        (candidate) => candidate.id === featureId,
      );
      return {
        ...current,
        selection: { kind: 'feature', featureId },
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: current.autoPlacementSettings.wallFeatures.map((candidate) =>
            candidate.id === featureId ? { ...candidate, placed: false } : candidate,
          ),
        },
        ...withMessage(
          current,
          feature
            ? `Returned ${feature.name} to the staging tray.`
            : 'Returned furniture or feature to the staging tray.',
        ),
      };
    });
  }

  function handleWallPointerDownCapture(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'touch') {
      if (wallZoom.scale > 1 && isWallPanTarget(event.target)) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          event.preventDefault();
          startWallPan(event, getPointerId(event), rect);
        }
      } else if (event.target === event.currentTarget && event.button === 0) {
        startMarquee(event);
      }
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    tryCapturePointer(event.currentTarget, event.pointerId);

    const gesture = wallZoomGestureRef.current ?? {
      pointers: new Map<number, { clientX: number; clientY: number }>(),
      startDistance: 0,
      startScale: wallZoom.scale,
    };
    gesture.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (gesture.pointers.size >= 2) {
      const points = [...gesture.pointers.values()].slice(0, 2);
      gesture.startDistance = Math.max(0.01, distanceBetween(points[0], points[1]));
      gesture.startScale = wallZoom.scale;
    }
    wallZoomGestureRef.current = gesture;
  }

  function handleWallPanPointerDown(event: React.PointerEvent<SVGRectElement>) {
    if (
      dragRef.current ||
      sectionDragRef.current ||
      marqueeRef.current ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    ) {
      return;
    }

    const wantsPan = event.pointerType === 'touch' || event.button === 1 || spacePressedRef.current;
    if (!wantsPan && event.button === 0) {
      startMarquee(event);
      return;
    }
    if (!wantsPan || wallZoom.scale <= 1) {
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    startWallPan(event, getPointerId(event), rect);
  }

  function startMarquee(event: React.PointerEvent<SVGElement>) {
    const point = clientPointToSvg(event);
    if (!point) {
      clearSelection();
      return;
    }
    event.preventDefault();
    tryCapturePointer(event.currentTarget, event.pointerId);
    marqueeRef.current = {
      startPoint: point,
      startClientX: event.clientX,
      startClientY: event.clientY,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
      initialPieceIds: selectedPieceIds,
      hasMoved: false,
    };
  }

  function handleWallPanMouseDown(event: React.MouseEvent<SVGRectElement>) {
    if (
      wallZoom.scale <= 1 ||
      (event.button !== 1 && !spacePressedRef.current) ||
      dragRef.current ||
      sectionDragRef.current ||
      marqueeRef.current ||
      wallPanRef.current ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    ) {
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    event.preventDefault();
    startWallPan(event, WALL_MOUSE_PAN_ID, rect);
  }

  function handleWallPanPointerMove(event: React.PointerEvent<SVGRectElement>) {
    if (updateWallPan(event)) {
      event.preventDefault();
    }
  }

  function handleWallPanMouseMove(event: React.MouseEvent<SVGRectElement>) {
    if (updateWallMousePan(event.nativeEvent)) {
      event.preventDefault();
    }
  }

  function handleStagedPiecePointerDown(event: React.PointerEvent<HTMLElement>, pieceId: string) {
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    if (!piece) {
      return;
    }
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    selectPiece(pieceId);

    const placement = getPointerPlacement(event, piece);
    if (!placement) {
      return;
    }
    const size = getRenderedPieceSize(piece);
    dragRef.current = {
      itemKind: 'piece',
      itemId: pieceId,
      source: 'staging',
      startPoint: null,
      startPlacement: null,
      latestPlacement: placement,
      startFeature: null,
      latestFeature: null,
      previewWidthPx: size.widthPx,
      previewHeightPx: size.heightPx,
      pieceIds: [pieceId],
      startPlacements: [],
      latestPlacements: [placement],
      latestGuides: [],
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
    setCursorInteraction('dragging-piece');
    startSuppressingTextSelection();
    showSnappedPreview(placement, piece, size, event);
  }

  function handleStagedFeaturePointerDown(
    event: React.PointerEvent<HTMLElement>,
    featureId: string,
  ) {
    const feature = state.autoPlacementSettings.wallFeatures.find(
      (candidate) => candidate.id === featureId,
    );
    if (!feature) {
      return;
    }
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    selectFeature(featureId);

    const proposedFeature = getPointerFeaturePlacement(event, feature);
    if (!proposedFeature) {
      return;
    }
    const size = getRenderedFeatureSize(feature);
    dragRef.current = {
      itemKind: 'feature',
      itemId: featureId,
      source: 'staging',
      startPoint: null,
      startPlacement: null,
      latestPlacement: null,
      startFeature: null,
      latestFeature: proposedFeature,
      previewWidthPx: size.widthPx,
      previewHeightPx: size.heightPx,
      pieceIds: [],
      startPlacements: [],
      latestPlacements: [],
      latestGuides: [],
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
    setCursorInteraction('dragging-piece');
    startSuppressingTextSelection();
    showFeatureSnappedPreview(proposedFeature, size, event);
  }

  function handleSectionPointerDown(event: React.PointerEvent<SVGGElement>, section: WallSection) {
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    startSectionDrag(event, section);
  }

  function handleSectionMouseDown(event: React.MouseEvent<SVGGElement>, section: WallSection) {
    event.preventDefault();
    if (!sectionDragRef.current) {
      startSectionDrag(event, section);
    }
  }

  function startSectionDrag(event: { clientX: number; clientY: number }, section: WallSection) {
    selectSection(section.id);
    const point = clientPointToSvg(event);
    if (!point) {
      return;
    }
    beginSectionDragUndo();
    sectionDragRef.current = {
      sectionId: section.id,
      startPoint: point,
      startXIn: getSectionOffsetX(state.sections, section.id),
      startYIn: getSectionOffsetY(state.sections, section.id),
    };
    setCursorInteraction('dragging-section');
    startSuppressingTextSelection();
  }

  function runAutoPlacement(variantIndex: number, mode: 'place' | 'shuffle') {
    const result = autoPlacePieces(state.sections, state.pieces, {
      settings: state.autoPlacementSettings,
      existingPlacements: state.placements,
      variantIndex,
      features: {
        ...state.features,
        wallEdgeBufferGapIn: state.features.wallEdgeBuffer ? state.features.wallEdgeBufferGapIn : 0,
        artPieceBufferGapIn: state.features.artPieceBuffer ? state.features.artPieceBufferGapIn : 0,
      },
    });
    if (!result.ok) {
      setAutoPlacementFailure(
        result.diagnostics ? { message: result.message, diagnostics: result.diagnostics } : null,
      );
      setState((current) => ({ ...current, ...withMessage(current, result.message, 'error') }));
      return;
    }

    setAutoPlacementFailure(null);
    const resolvedVariantIndex = result.variantCount > 0 ? variantIndex % result.variantCount : 0;
    setAutoPlacementVariantIndex(resolvedVariantIndex);
    if (result.newPlacementCount === 0) {
      setState((current) => ({
        ...current,
        ...withMessage(current, result.explanation ?? 'Auto-placement made no changes.'),
      }));
      return;
    }

    const existingPieceIds = new Set(state.placements.map((placement) => placement.pieceId));
    const firstNewPlacement = result.placements.find(
      (placement) => !existingPieceIds.has(placement.pieceId),
    );
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      placements: result.placements,
      selection: firstNewPlacement
        ? { kind: 'pieces', pieceIds: [firstNewPlacement.pieceId] }
        : pieceSelection(getSelectedPieceIds(current.selection)),
      ...withMessage(
        current,
        result.preservedPlacementCount > 0
          ? `Auto-placement placed ${formatCount(result.newPlacementCount, 'remaining piece')} around ${formatCount(result.preservedPlacementCount, 'piece')} you positioned. Existing pieces were not moved.`
          : mode === 'shuffle'
            ? `Shuffled to layout ${resolvedVariantIndex + 1} of ${result.variantCount}.`
            : (result.explanation ?? `Auto-placement created a ${result.layoutKind} layout.`),
      ),
    }));
  }

  function handleAutoPlace() {
    runAutoPlacement(0, 'place');
  }

  function handleShuffleAutoPlace() {
    runAutoPlacement(autoPlacementVariantIndex + 1, 'shuffle');
  }

  function placeStagedPiece(pieceId: string) {
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    const alreadyPlacedIds = new Set(state.placements.map((placement) => placement.pieceId));
    if (!piece || alreadyPlacedIds.has(pieceId)) {
      return;
    }

    const piecesToConsider = state.pieces.filter(
      (candidate) => alreadyPlacedIds.has(candidate.id) || candidate.id === pieceId,
    );
    const result = autoPlacePieces(state.sections, piecesToConsider, {
      settings: state.autoPlacementSettings,
      existingPlacements: state.placements,
      features: {
        ...state.features,
        wallEdgeBufferGapIn: state.features.wallEdgeBuffer ? state.features.wallEdgeBufferGapIn : 0,
        artPieceBufferGapIn: state.features.artPieceBuffer ? state.features.artPieceBufferGapIn : 0,
      },
    });

    if (!result.ok) {
      setAutoPlacementFailure(
        result.diagnostics ? { message: result.message, diagnostics: result.diagnostics } : null,
      );
      setState((current) => ({ ...current, ...withMessage(current, result.message, 'error') }));
      return;
    }

    setAutoPlacementFailure(null);
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      placements: result.placements,
      selection: { kind: 'pieces', pieceIds: [pieceId] },
      ...withMessage(current, `Placed ${piece.label} on the wall.`),
    }));
  }

  function handlePointerDown(event: React.PointerEvent<SVGRectElement>, placement: Placement) {
    event.preventDefault();
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      togglePieceSelection(placement.pieceId);
      return;
    }
    const point = clientPointToSvg(event);
    if (!point || !svgRef.current) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const pieceIds = selectedPieceIds.includes(placement.pieceId)
      ? selectedPieceIds.filter((pieceId) =>
          state.placements.some((candidate) => candidate.pieceId === pieceId),
        )
      : [placement.pieceId];
    const startPlacements = state.placements.filter((candidate) =>
      pieceIds.includes(candidate.pieceId),
    );
    dragRef.current = {
      itemKind: 'piece',
      itemId: placement.pieceId,
      source: 'wall',
      startPoint: point,
      startPlacement: placement,
      latestPlacement: placement,
      startFeature: null,
      latestFeature: null,
      previewWidthPx: rect.width,
      previewHeightPx: rect.height,
      pieceIds,
      startPlacements,
      latestPlacements: startPlacements,
      latestGuides: [],
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
    setCursorInteraction('dragging-piece');
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    startSuppressingTextSelection();
    if (startPlacements.length > 1) {
      const snapped = applyPlacementGroupFeaturesWithMetadata({
        proposedPlacements: startPlacements,
        movingPieceIds: pieceIds,
        sections: state.sections,
        pieces: state.pieces,
        placements: state.placements,
        features: {
          ...state.features,
          snapToGrid: false,
          snapToAlignment: false,
        },
        featureRects: state.autoPlacementSettings.wallFeatures,
      });
      dragRef.current.latestPlacements = snapped.value;
      dragRef.current.latestGuides = snapped.guides;
      setGroupDragPreview(snapped.value);
      showGroupDragPreview(
        snapped.value,
        placement.pieceId,
        event,
        { widthPx: rect.width, heightPx: rect.height },
        snapped.guides,
      );
    } else {
      showSnappedPreview(
        placement,
        state.pieces.find((piece) => piece.id === placement.pieceId),
        { widthPx: rect.width, heightPx: rect.height },
        event,
      );
    }
    if (selectedPieceIds.includes(placement.pieceId)) {
      setState((current) =>
        current.selection.kind === 'feature'
          ? { ...current, selection: { kind: 'none' } }
          : current,
      );
    } else {
      selectPiece(placement.pieceId);
    }
  }

  function handleFeaturePointerDown(
    event: React.PointerEvent<SVGRectElement>,
    feature: WallFeature,
  ) {
    event.preventDefault();
    const point = clientPointToSvg(event);
    if (!point || !svgRef.current) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const placedFeature = { ...feature, yIn: feature.yIn ?? getLegacyFeatureYIn(feature) };
    dragRef.current = {
      itemKind: 'feature',
      itemId: feature.id,
      source: 'wall',
      startPoint: point,
      startPlacement: null,
      latestPlacement: null,
      startFeature: placedFeature,
      latestFeature: placedFeature,
      previewWidthPx: rect.width,
      previewHeightPx: rect.height,
      pieceIds: [],
      startPlacements: [],
      latestPlacements: [],
      latestGuides: [],
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false,
    };
    setCursorInteraction('dragging-piece');
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    startSuppressingTextSelection();
    showFeatureSnappedPreview(placedFeature, { widthPx: rect.width, heightPx: rect.height }, event);
    selectFeature(feature.id);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (updateWallPan(event)) {
      event.preventDefault();
      return;
    }

    if (updateSectionDrag(event)) {
      event.preventDefault();
      return;
    }

    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    event.preventDefault();
    updatePointerDrag(event);
  }

  function updateSectionDrag(event: { clientX: number; clientY: number }): boolean {
    const sectionDrag = sectionDragRef.current;
    if (!sectionDrag) {
      return false;
    }

    const point = clientPointToSvg(event);
    if (!point) {
      return false;
    }

    const proposed = {
      xIn: roundToPrecision(sectionDrag.startXIn + point.x - sectionDrag.startPoint.x),
      yIn: roundToPrecision(sectionDrag.startYIn + point.y - sectionDrag.startPoint.y),
    };
    setState((current) => {
      const sections = moveWallSection(
        current.sections,
        sectionDrag.sectionId,
        applyWallSectionFeatures(
          current.sections,
          sectionDrag.sectionId,
          proposed,
          current.features,
        ),
      );
      const placements = reassignPlacementsToContainingSections(
        current.sections,
        current.pieces,
        current.placements,
      );
      return {
        ...current,
        placements,
        sections,
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: movePlacedFeaturesWithWallSection(
            current.autoPlacementSettings.wallFeatures,
            current.sections,
            sections,
            sectionDrag.sectionId,
          ),
        },
        ...withMessage(current, 'Wall section moved. Sections snap together by shared edges.'),
      };
    });
    return true;
  }

  function handlePointerUp(event?: React.PointerEvent<SVGSVGElement>) {
    finishPieceDrag(event);
    finishWallPan(event);
    finishMarquee();
  }

  function updateMarquee(event: { clientX: number; clientY: number }): boolean {
    const marquee = marqueeRef.current;
    if (!marquee) {
      return false;
    }
    const distance = Math.hypot(
      event.clientX - marquee.startClientX,
      event.clientY - marquee.startClientY,
    );
    if (!marquee.hasMoved && distance < POINTER_DRAG_THRESHOLD_PX) {
      return true;
    }
    const point = clientPointToSvg(event);
    if (!point) {
      return true;
    }
    if (!marquee.hasMoved) {
      marquee.hasMoved = true;
      setSelectedSectionId('');
      startSuppressingTextSelection();
    }
    const rect = normalizeSelectionRect(marquee.startPoint, point);
    const hitIds = getPieceIdsIntersectingRect(
      state.sections,
      state.pieces,
      state.placements,
      rect,
    );
    setSelectionMarquee(rect);
    setState((current) => ({
      ...current,
      selection: pieceSelection(
        marquee.additive
          ? [
              ...marquee.initialPieceIds,
              ...hitIds.filter((id) => !marquee.initialPieceIds.includes(id)),
            ]
          : hitIds,
      ),
    }));
    return true;
  }

  function finishMarquee() {
    const marquee = marqueeRef.current;
    if (!marquee) {
      return;
    }
    if (!marquee.hasMoved) {
      clearSelection();
    }
    marqueeRef.current = null;
    setSelectionMarquee(null);
    stopSuppressingTextSelection();
  }

  function finishPieceDrag(event?: { clientX: number; clientY: number; pointerId?: number }) {
    finishWallZoomGesture(event);
    const drag = dragRef.current;
    const droppedInTray = Boolean(drag && event && pointerIsOverStagingTray(event));
    if (drag?.itemKind === 'piece' && drag.source === 'wall' && !drag.hasMoved) {
      // A click selects the piece without creating an undoable placement change.
    } else if (drag && droppedInTray) {
      if (drag.itemKind === 'feature') {
        removeFeaturePlacement(drag.itemId);
      } else if (drag.source === 'wall') {
        removePlacementGroup(drag.pieceIds);
      } else {
        removePlacement(drag.itemId);
      }
    } else if (
      drag?.itemKind === 'piece' &&
      drag.source === 'wall' &&
      drag.latestPlacements.length > 0
    ) {
      commitPiecePlacementGroup(drag.latestPlacements, drag.pieceIds, drag.latestGuides);
    } else if (
      drag?.latestPlacement &&
      drag.itemKind === 'piece' &&
      (drag.source === 'wall' || (event && pointerIsOverWallCanvas(event)))
    ) {
      commitPiecePlacement(drag.latestPlacement);
    } else if (
      drag?.latestFeature &&
      drag.itemKind === 'feature' &&
      (drag.source === 'wall' || (event && pointerIsOverWallCanvas(event)))
    ) {
      commitFeaturePlacement(drag.latestFeature);
    }
    finishSectionDragUndo();
    dragRef.current = null;
    sectionDragRef.current = null;
    setCursorInteraction('idle');
    setWallDragPreview(null);
    setGroupDragPreview([]);
    if (drag && !droppedInTray) {
      lingerAlignmentGuides();
    } else {
      showAlignmentGuides([]);
    }
    stopSuppressingTextSelection();
  }

  function pointerIsOverStagingTray(
    event: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>,
  ): boolean {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element?.closest('.staging-tray') !== null;
  }

  function pointerIsOverWallCanvas(
    event: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>,
  ): boolean {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element?.closest('.wall-canvas') !== null;
  }

  function handleCanvasKeyDown(event: KeyboardEvent) {
    if (isTextEntryTarget(event.target)) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.target instanceof Element && event.target.closest('svg [role="button"]')) {
      return;
    }
    const step = event.shiftKey ? 1 : 1 / 4;
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const delta = deltas[event.key];
    if (!delta) {
      return;
    }

    if (selectedFeature) {
      event.preventDefault();
      nudgeFeature({
        ...selectedFeature,
        xIn: roundToPrecision(selectedFeature.xIn + delta[0]),
        yIn: roundToPrecision(
          (selectedFeature.yIn ?? getLegacyFeatureYIn(selectedFeature)) + delta[1],
        ),
      });
      return;
    }

    const selectedPlacedPieceIds = selectedPieceIds.filter((pieceId) =>
      state.placements.some((placement) => placement.pieceId === pieceId),
    );
    if (!selectedPiece || !selectedPlacement || selectedPlacedPieceIds.length === 0) {
      return;
    }
    event.preventDefault();
    nudgePieceGroup(selectedPlacedPieceIds, delta[0], delta[1]);
  }

  function handleSectionKeyDown(event: React.KeyboardEvent<SVGGElement>, section: WallSection) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectSection(section.id);
      return;
    }

    const step = event.shiftKey ? 1 : 1 / 4;
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const delta = deltas[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    setSelectedSectionId(section.id);
    setState((current) => {
      const sections = moveWallSection(
        current.sections,
        section.id,
        applyWallSectionFeatures(
          current.sections,
          section.id,
          { xIn: (section.xIn ?? 0) + delta[0], yIn: (section.yIn ?? 0) + delta[1] },
          current.features,
        ),
      );
      const placements = reassignPlacementsToContainingSections(
        current.sections,
        current.pieces,
        current.placements,
      );
      return {
        ...current,
        placements,
        sections,
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: movePlacedFeaturesWithWallSection(
            current.autoPlacementSettings.wallFeatures,
            current.sections,
            sections,
            section.id,
          ),
        },
        ...withMessage(current, 'Wall section moved. Sections snap together by shared edges.'),
      };
    });
  }

  function handlePieceKeyDown(event: React.KeyboardEvent<SVGRectElement>, placement: Placement) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectPiece(placement.pieceId);
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 1 : 1 / 4;
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const [deltaX, deltaY] = deltas[event.key];
    const pieceIds = selectedPieceIds.includes(placement.pieceId)
      ? selectedPieceIds.filter((pieceId) =>
          state.placements.some((candidate) => candidate.pieceId === pieceId),
        )
      : [placement.pieceId];
    if (!selectedPieceIds.includes(placement.pieceId)) {
      selectPiece(placement.pieceId);
    }
    nudgePieceGroup(pieceIds, deltaX, deltaY);
  }

  function handleFeatureKeyDown(event: React.KeyboardEvent<SVGRectElement>, feature: WallFeature) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectFeature(feature.id);
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 1 : 1 / 4;
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const [deltaX, deltaY] = deltas[event.key];
    nudgeFeature({
      ...feature,
      xIn: roundToPrecision(feature.xIn + deltaX),
      yIn: roundToPrecision((feature.yIn ?? getLegacyFeatureYIn(feature)) + deltaY),
    });
  }

  function updatePointerDrag(event: { clientX: number; clientY: number }) {
    const drag = dragRef.current;
    const point = clientPointToSvg(event);
    if (!drag || !point) {
      return;
    }

    if (drag.itemKind === 'piece') {
      const piece = state.pieces.find((candidate) => candidate.id === drag.itemId);
      if (!piece) {
        return;
      }

      if (drag.source === 'staging') {
        drag.hasMoved = true;
        drag.latestPlacement = getPointerPlacement(event, piece);
      } else if (drag.startPlacement && drag.startPoint) {
        const clientDistance = Math.hypot(
          event.clientX - drag.startClientX,
          event.clientY - drag.startClientY,
        );
        if (!drag.hasMoved && clientDistance < POINTER_DRAG_THRESHOLD_PX) {
          return;
        }
        drag.hasMoved = true;
        const proposedPlacements = translatePlacementGroup(
          state.sections,
          state.pieces,
          drag.startPlacements,
          drag.pieceIds,
          point.x - drag.startPoint.x,
          point.y - drag.startPoint.y,
        );
        const snapped = applyPlacementGroupFeaturesWithMetadata({
          proposedPlacements,
          movingPieceIds: drag.pieceIds,
          sections: state.sections,
          pieces: state.pieces,
          placements: state.placements,
          features: state.features,
          featureRects: state.autoPlacementSettings.wallFeatures,
        });
        drag.latestPlacements = snapped.value;
        drag.latestGuides = snapped.guides;
        drag.latestPlacement =
          drag.latestPlacements.find((placement) => placement.pieceId === drag.itemId) ?? null;
        setGroupDragPreview(drag.latestPlacements);
        showGroupDragPreview(
          drag.latestPlacements,
          drag.itemId,
          event,
          {
            widthPx: drag.previewWidthPx,
            heightPx: drag.previewHeightPx,
          },
          snapped.guides,
        );
        return;
      }

      if (!drag.latestPlacement) {
        return;
      }
      showSnappedPreview(
        drag.latestPlacement,
        piece,
        { widthPx: drag.previewWidthPx, heightPx: drag.previewHeightPx },
        event,
      );
      return;
    }

    const feature = state.autoPlacementSettings.wallFeatures.find(
      (candidate) => candidate.id === drag.itemId,
    );
    if (!feature) {
      return;
    }
    if (drag.source === 'staging') {
      drag.latestFeature = getPointerFeaturePlacement(event, feature);
    } else if (drag.startFeature && drag.startPoint) {
      drag.latestFeature = {
        ...drag.startFeature,
        xIn: roundToPrecision(drag.startFeature.xIn + point.x - drag.startPoint.x),
        yIn: roundToPrecision((drag.startFeature.yIn ?? 0) + point.y - drag.startPoint.y),
      };
    }

    if (!drag.latestFeature) {
      return;
    }
    showFeatureSnappedPreview(
      drag.latestFeature,
      { widthPx: drag.previewWidthPx, heightPx: drag.previewHeightPx },
      event,
    );
  }

  function showSnappedPreview(
    placement: Placement,
    piece: ArtPiece | undefined,
    size: { widthPx: number; heightPx: number },
    fallbackPoint: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>,
  ) {
    if (!piece) {
      return;
    }

    const snapped = applyFeaturesWithMetadata(state, placement);
    const snappedPlacement = snapped.value;
    showAlignmentGuides(snapped.guides);
    const center = {
      x:
        getSectionOffsetX(state.sections, snappedPlacement.sectionId) +
        snappedPlacement.xIn +
        piece.widthIn / 2,
      y:
        getSectionOffsetY(state.sections, snappedPlacement.sectionId) +
        snappedPlacement.yIn +
        piece.heightIn / 2,
    };
    const clientPoint = svgPointToClient(center);
    setWallDragPreview({
      itemId: piece.id,
      itemKind: 'piece',
      label: piece.label,
      widthIn: piece.widthIn,
      heightIn: piece.heightIn,
      clientX: clientPoint?.x ?? fallbackPoint.clientX,
      clientY: clientPoint?.y ?? fallbackPoint.clientY,
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      itemCount: 1,
      artwork: piece,
    });
  }

  function showGroupDragPreview(
    placements: Placement[],
    grabbedPieceId: string,
    fallbackPoint: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>,
    singlePieceSize: { widthPx: number; heightPx: number },
    guides: AlignmentGuide[] = [],
  ) {
    showAlignmentGuides(guides);
    const bounds = getGroupBounds(
      state.sections,
      state.pieces,
      placements,
      placements.map((placement) => placement.pieceId),
    );
    const grabbedPiece = state.pieces.find((piece) => piece.id === grabbedPieceId);
    if (!bounds || !grabbedPiece) {
      return;
    }
    const widthIn = bounds.right - bounds.left;
    const heightIn = bounds.bottom - bounds.top;
    const size = placements.length === 1 ? singlePieceSize : getRenderedItemSize(widthIn, heightIn);
    const previewPieces =
      placements.length > 1
        ? placements.flatMap((placement) => {
            const piece = state.pieces.find((candidate) => candidate.id === placement.pieceId);
            if (!piece) {
              return [];
            }
            return [
              {
                id: piece.id,
                label: piece.label,
                widthIn: piece.widthIn,
                heightIn: piece.heightIn,
                hookSpec: piece.hookSpec,
                xIn:
                  getSectionOffsetX(state.sections, placement.sectionId) +
                  placement.xIn -
                  bounds.left,
                yIn:
                  getSectionOffsetY(state.sections, placement.sectionId) +
                  placement.yIn -
                  bounds.top,
              },
            ];
          })
        : undefined;
    const clientPoint = svgPointToClient({
      x: bounds.left + widthIn / 2,
      y: bounds.top + heightIn / 2,
    });
    setWallDragPreview({
      itemId: grabbedPieceId,
      itemKind: 'piece',
      label: placements.length === 1 ? grabbedPiece.label : `${placements.length} art pieces`,
      widthIn,
      heightIn,
      clientX: clientPoint?.x ?? fallbackPoint.clientX,
      clientY: clientPoint?.y ?? fallbackPoint.clientY,
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      itemCount: placements.length,
      artwork: placements.length === 1 ? grabbedPiece : undefined,
      pieces: previewPieces,
    });
  }

  function showFeatureSnappedPreview(
    feature: WallFeature,
    size: { widthPx: number; heightPx: number },
    fallbackPoint: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>,
  ) {
    const snapped = applyFeatureFeaturesWithMetadata(state, { ...feature, placed: true });
    const snappedFeature = snapped.value;
    showAlignmentGuides(snapped.guides);
    const center = {
      x: snappedFeature.xIn + snappedFeature.widthIn / 2,
      y: (snappedFeature.yIn ?? 0) + snappedFeature.heightIn / 2,
    };
    const clientPoint = svgPointToClient(center);
    setWallDragPreview({
      itemId: feature.id,
      itemKind: 'feature',
      label: feature.name,
      widthIn: feature.widthIn,
      heightIn: feature.heightIn,
      clientX: clientPoint?.x ?? fallbackPoint.clientX,
      clientY: clientPoint?.y ?? fallbackPoint.clientY,
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      itemCount: 1,
      feature: snappedFeature,
    });
  }

  function getRenderedPieceSize(piece: ArtPiece): { widthPx: number; heightPx: number } {
    return getRenderedItemSize(piece.widthIn, piece.heightIn);
  }

  function getRenderedFeatureSize(feature: WallFeature): { widthPx: number; heightPx: number } {
    return getRenderedItemSize(feature.widthIn, feature.heightIn);
  }

  function getRenderedItemSize(
    widthIn: number,
    heightIn: number,
  ): { widthPx: number; heightPx: number } {
    const svg = svgRef.current;
    const viewBox = svg?.viewBox.baseVal;
    const rect = svg?.getBoundingClientRect();

    if (viewBox && rect && viewBox.width > 0 && viewBox.height > 0) {
      const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
      if (Number.isFinite(scale) && scale > 0) {
        return {
          widthPx: widthIn * scale,
          heightPx: heightIn * scale,
        };
      }
    }

    return {
      widthPx: widthIn * DRAG_PREVIEW_SCALE_PX_PER_IN,
      heightPx: heightIn * DRAG_PREVIEW_SCALE_PX_PER_IN,
    };
  }

  function getPointerPlacement(
    event: { clientX: number; clientY: number },
    piece: ArtPiece,
  ): Placement | null {
    const point = clientPointToSvg(event);
    const layout = getWallLayout(state.sections);
    const targetLayout = point
      ? layout.find(
          ({ section, offsetXIn, offsetYIn }) =>
            point.x >= offsetXIn &&
            point.x <= offsetXIn + section.widthIn &&
            point.y >= offsetYIn &&
            point.y <= offsetYIn + section.heightIn,
        )
      : undefined;
    const fallbackLayout = layout[0];
    const target = targetLayout ?? fallbackLayout;

    if (!target) {
      return null;
    }

    const sectionCenterX = target.offsetXIn + target.section.widthIn / 2;
    const sectionCenterY = target.offsetYIn + target.section.heightIn / 2;
    const dropX = point ? point.x : sectionCenterX;
    const dropY = point ? point.y : sectionCenterY;

    return {
      pieceId: piece.id,
      sectionId: target.section.id,
      xIn: roundToPrecision(dropX - target.offsetXIn - piece.widthIn / 2),
      yIn: roundToPrecision(dropY - target.offsetYIn - piece.heightIn / 2),
    };
  }

  function getPointerFeaturePlacement(
    event: { clientX: number; clientY: number },
    feature: WallFeature,
  ): WallFeature | null {
    const point = clientPointToSvg(event);
    const layout = getWallLayout(state.sections);
    const fallbackLayout = layout[0];
    if (!point && !fallbackLayout) {
      return null;
    }

    const dropX = point ? point.x : fallbackLayout.offsetXIn + fallbackLayout.section.widthIn / 2;
    const dropY = point ? point.y : fallbackLayout.offsetYIn + fallbackLayout.section.heightIn / 2;

    return {
      ...feature,
      xIn: roundToPrecision(dropX - feature.widthIn / 2),
      yIn: roundToPrecision(dropY - feature.heightIn / 2),
      placed: true,
    };
  }

  function getLegacyFeatureYIn(feature: WallFeature): number {
    const bounds = getWallBounds(state.sections);
    const rule = resolveWallFeatureRule(feature);
    return roundToPrecision(bounds.maxY - feature.heightIn - rule.clearanceIn);
  }

  function getExportInput(): ExportDesignInput {
    return {
      sections: state.sections,
      pieces: state.pieces,
      placements: state.placements,
      measurements,
      unit: state.unit,
      autoPlacementSettings: state.autoPlacementSettings,
    };
  }

  async function exportPng() {
    if (exporting) {
      return;
    }
    setExporting('png');
    setState((current) => ({ ...current, ...withMessage(current, 'Exporting PNG...') }));
    try {
      await downloadPng(getExportInput());
      setState((current) => ({ ...current, ...withMessage(current, 'PNG export generated.') }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown export error.';
      setState((current) => ({
        ...current,
        ...withMessage(current, `PNG export failed: ${reason}`, 'error'),
      }));
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (exporting) {
      return;
    }
    setExporting('pdf');
    setState((current) => ({ ...current, ...withMessage(current, 'Exporting PDF...') }));
    try {
      await downloadPdf(getExportInput());
      setState((current) => ({ ...current, ...withMessage(current, 'PDF export generated.') }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown export error.';
      setState((current) => ({
        ...current,
        ...withMessage(current, `PDF export failed: ${reason}`, 'error'),
      }));
    } finally {
      setExporting(null);
    }
  }

  function exportJson() {
    const json = serializeDesignFile({ ...state, selectedPieceIds });
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gallery-wall-design.json';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setState((current) => ({ ...current, ...withMessage(current, 'JSON design file exported.') }));
  }

  async function importJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const { selectedPieceIds: importedSelectedPieceIds, ...importedRest } = parseDesignFile(
        await file.text(),
      );
      // recordUndoSnapshot()'s default parameter closes over the state from
      // the render that created this callback, which is stale once we're past
      // the await — read the live value via the ref instead so an edit made
      // while the file was being read isn't silently discarded by Undo.
      recordUndoSnapshot(latestStateRef.current);
      setState((current) => ({
        ...defaultState,
        ...importedRest,
        selection: pieceSelection(importedSelectedPieceIds),
        ...withMessage(current, 'JSON design file imported.'),
      }));
      setSelectedSectionId('');
    } catch (error) {
      setState((current) => ({
        ...current,
        ...withMessage(
          current,
          error instanceof Error ? error.message : 'Could not import the design file.',
          'error',
        ),
      }));
    }
  }

  const appShellClassName = [
    'app-shell',
    wallZoom.scale > 1 ? 'is-wall-pannable' : '',
    cursorInteraction === 'dragging-piece' ? 'is-dragging-piece' : '',
    cursorInteraction === 'dragging-section' ? 'is-dragging-section' : '',
    cursorInteraction === 'panning-wall' ? 'is-panning-wall' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className={appShellClassName} onPointerDown={handlePagePointerDown}>
      <MessageToast
        message={state.message}
        details={toastDetails}
        tone={state.messageTone}
        visible={toastVisible}
        onDismiss={dismissToast}
      />
      <header className="topbar">
        <div className="brand-lockup">
          <BrandLogo />
          <div className="brand-copy">
            <h1>Gallery Designer</h1>
            <p>Plan a continuous wall, place art to scale, and export installation measurements.</p>
          </div>
        </div>
      </header>

      <section className="workspace" ref={workspaceRef}>
        <aside className="setup-panel" aria-label="Setup controls">
          <CollapsiblePanel
            icon={<Ruler size={18} />}
            title="Wall sections"
            badge={state.sections.length}
            ariaLabel="Wall section settings"
            className="setup-utility-panel wall-sections-panel"
            contentClassName="wall-sections-panel-content"
          >
            <div className="section-list">
              {state.sections.map((section, index) => (
                <article
                  className={`setup-row section-row ${
                    section.id === selectedSectionId ? 'selected' : ''
                  } ${expandedSectionId === section.id ? 'expanded' : 'collapsed'}`}
                  key={section.id}
                  onClick={(event) => {
                    if (
                      event.target instanceof HTMLElement &&
                      event.target.closest('input, select, button')
                    ) {
                      return;
                    }
                    toggleSectionSelection(section.id);
                  }}
                >
                  <div className="row-heading">
                    {expandedSectionId === section.id ? (
                      <input
                        aria-label={`Section ${index + 1} name`}
                        value={section.name}
                        onFocus={() => {
                          beginFieldEdit();
                          selectSection(section.id);
                        }}
                        onBlur={finishFieldEdit}
                        onChange={(event) =>
                          updateSection(section.id, { name: event.target.value })
                        }
                      />
                    ) : (
                      <div className="row-name-readonly" aria-label={`Section ${index + 1} name`}>
                        {section.name}
                      </div>
                    )}
                    <TooltipIconButton
                      ariaLabel={`Remove Section ${index + 1}`}
                      tooltip="Remove wall section"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSection(section.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </TooltipIconButton>
                  </div>
                  <p className="row-summary">
                    {formatMeasurement(section.widthIn, state.unit)} x{' '}
                    {formatMeasurement(section.heightIn, state.unit)}
                  </p>
                  <div className="field-grid">
                    <NumberField
                      label={`Section ${index + 1} width`}
                      displayLabel="Width"
                      valueIn={section.widthIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(section.widthIn) || section.widthIn <= 0
                          ? `${section.name} needs a positive width.`
                          : undefined
                      }
                      onUnitChange={updateUnit}
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(widthIn) => updateSection(section.id, { widthIn })}
                    />
                    <NumberField
                      label={`Section ${index + 1} height`}
                      displayLabel="Height"
                      valueIn={section.heightIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(section.heightIn) || section.heightIn <= 0
                          ? `${section.name} needs a positive height.`
                          : undefined
                      }
                      onUnitChange={updateUnit}
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(heightIn) => updateSection(section.id, { heightIn })}
                    />
                  </div>
                </article>
              ))}
            </div>
            <button type="button" className="secondary full-width" onClick={addSection}>
              <Plus size={18} />
              Add wall section
            </button>
          </CollapsiblePanel>

          <CollapsiblePanel
            icon={<Move size={18} />}
            title="Art pieces"
            badge={state.pieces.length}
            ariaLabel="Art piece settings"
            className="setup-utility-panel art-pieces-panel"
            contentClassName="art-pieces-panel-content"
          >
            <div className="piece-list">
              {state.pieces.map((piece, index) => (
                <article
                  className={`setup-row piece-row ${
                    selectedPieceIds.includes(piece.id) ? 'selected' : ''
                  } ${expandedPieceId === piece.id ? 'expanded' : 'collapsed'}`}
                  key={piece.id}
                  onClick={(event) => {
                    if (
                      event.target instanceof HTMLElement &&
                      event.target.closest('input, select, button')
                    ) {
                      return;
                    }
                    handlePieceRowSelection(piece.id, {
                      additive: event.shiftKey || event.metaKey || event.ctrlKey,
                    });
                  }}
                >
                  <div className="row-heading">
                    {expandedPieceId === piece.id ? (
                      <input
                        aria-label={`Piece ${index + 1} label`}
                        value={piece.label}
                        onFocus={() => {
                          beginFieldEdit();
                          selectPiece(piece.id);
                        }}
                        onBlur={finishFieldEdit}
                        onChange={(event) => updatePiece(piece.id, { label: event.target.value })}
                      />
                    ) : (
                      <div className="row-name-readonly" aria-label={`Piece ${index + 1} name`}>
                        {piece.label}
                      </div>
                    )}
                    <span className="row-actions">
                      <TooltipIconButton
                        ariaLabel={`Duplicate Piece ${index + 1}`}
                        tooltip="Duplicate artwork"
                        onClick={(event) => {
                          event.stopPropagation();
                          duplicatePiece(piece.id);
                        }}
                      >
                        <Copy size={16} />
                      </TooltipIconButton>
                      <TooltipIconButton
                        ariaLabel={`Remove Piece ${index + 1}`}
                        tooltip="Remove artwork"
                        onClick={(event) => {
                          event.stopPropagation();
                          removePiece(piece.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </TooltipIconButton>
                    </span>
                  </div>
                  <p className="row-summary">
                    {formatMeasurement(piece.widthIn, state.unit)} x{' '}
                    {formatMeasurement(piece.heightIn, state.unit)}
                  </p>
                  <div className="field-grid">
                    <NumberField
                      label={`Piece ${index + 1} width`}
                      displayLabel="Width"
                      valueIn={piece.widthIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(piece.widthIn) || piece.widthIn <= 0
                          ? `${piece.label} needs a positive width.`
                          : undefined
                      }
                      onUnitChange={updateUnit}
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(widthIn) => updatePiece(piece.id, { widthIn })}
                    />
                    <NumberField
                      label={`Piece ${index + 1} height`}
                      displayLabel="Height"
                      valueIn={piece.heightIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(piece.heightIn) || piece.heightIn <= 0
                          ? `${piece.label} needs a positive height.`
                          : undefined
                      }
                      onUnitChange={updateUnit}
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(heightIn) => updatePiece(piece.id, { heightIn })}
                    />
                  </div>
                  <HookControls
                    piece={piece}
                    unit={state.unit}
                    onUnitChange={updateUnit}
                    onChange={(hookSpec) => updatePiece(piece.id, { hookSpec })}
                    onEditStart={beginFieldEdit}
                    onEditEnd={finishFieldEdit}
                    onImmediateChange={recordUndoSnapshot}
                  />
                </article>
              ))}
            </div>
            <button type="button" className="secondary full-width" onClick={addPiece}>
              <Plus size={18} />
              Add art piece
            </button>
          </CollapsiblePanel>
        </aside>

        <section className="editor-column" ref={editorColumnRef}>
          <div className="editor-toolbar" role="toolbar" aria-label="Editor controls">
            <div className="toolbar-group" role="group" aria-label="Placement controls">
              <div className="clear-menu" ref={clearMenuRef}>
                <button
                  type="button"
                  className="secondary"
                  aria-haspopup="menu"
                  aria-expanded={clearMenuOpen}
                  onClick={() => setClearMenuOpen((open) => !open)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setClearMenuOpen(false);
                    }
                  }}
                >
                  <RotateCcw size={18} />
                  Clear…
                  <ChevronDown size={16} />
                </button>
                {clearMenuOpen ? (
                  <div className="clear-menu-popover" role="menu" aria-label="Clear options">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={state.placements.length === 0}
                      onClick={() => runClearAction(clearPlacedArt)}
                    >
                      Clear placed art
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={state.sections.length === 0}
                      onClick={() => runClearAction(clearWallSections)}
                    >
                      Clear wall sections
                    </button>
                    {state.autoPlacementSettings.wallSetupMode === 'full-wall-with-features' ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={state.autoPlacementSettings.wallFeatures.length === 0}
                        onClick={() => runClearAction(clearWallFeatures)}
                      >
                        Clear furniture & features
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="destructive-menuitem"
                      onClick={() => runClearAction(resetEntireDesign)}
                    >
                      Reset entire design
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="secondary"
                disabled={!undoState}
                onClick={undoLastChange}
              >
                Undo last change
              </button>
            </div>
            <div className="drawer-button-group">
              <button
                type="button"
                className="secondary"
                aria-expanded={advancedDrawerOpen}
                onClick={() => setAdvancedDrawerOpen(true)}
              >
                <SlidersHorizontal size={18} />
                Advanced
              </button>
            </div>
          </div>
          <div className="canvas-card" ref={wallDisplayRef}>
            <div className="wall-canvas-shell">
              <WallCanvas
                svgRef={svgRef}
                sections={state.sections}
                pieces={state.pieces}
                placements={state.placements}
                selectedPieceIds={selectedPieceIds}
                selectedFeatureId={selectedFeatureId}
                selectedSectionId={selectedSectionId}
                selectionMarquee={selectionMarquee}
                groupDragPreview={groupDragPreview}
                autoPlacementSettings={state.autoPlacementSettings}
                features={state.features}
                alignmentGuides={
                  state.features.showAlignmentGuides
                    ? visibleAlignmentGuides
                    : { guides: [], isLingering: false }
                }
                unit={state.unit}
                viewBox={wallViewBox}
                onSectionPointerDown={handleSectionPointerDown}
                onSectionMouseDown={handleSectionMouseDown}
                onSectionKeyDown={handleSectionKeyDown}
                onPointerDownCapture={handleWallPointerDownCapture}
                onPanPointerDown={handleWallPanPointerDown}
                onPanPointerMove={handleWallPanPointerMove}
                onPanMouseDown={handleWallPanMouseDown}
                onPanMouseMove={handleWallPanMouseMove}
                onPointerDown={handlePointerDown}
                onFeaturePointerDown={handleFeaturePointerDown}
                onPieceKeyDown={handlePieceKeyDown}
                onFeatureKeyDown={handleFeatureKeyDown}
                onRemovePlacement={removePlacement}
                onRemoveFeaturePlacement={removeFeaturePlacement}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
              <div
                className="zoom-controls zoom-controls-overlay"
                role="group"
                aria-label="Wall zoom controls"
              >
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label="Zoom out"
                  title="Zoom out"
                  onClick={() => zoomWallBy(1 / ZOOM_BUTTON_FACTOR)}
                >
                  <ZoomOut size={18} aria-hidden="true" focusable="false" />
                </button>
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label="Fit wall"
                  title="Fit wall"
                  onClick={fitWallZoom}
                >
                  <Maximize2 size={18} aria-hidden="true" focusable="false" />
                </button>
                <button
                  type="button"
                  className="secondary icon-button"
                  aria-label="Zoom in"
                  title="Zoom in"
                  onClick={() => zoomWallBy(ZOOM_BUTTON_FACTOR)}
                >
                  <ZoomIn size={18} aria-hidden="true" focusable="false" />
                </button>
              </div>
            </div>
            <StagingTray
              pieces={state.pieces}
              placements={state.placements}
              features={
                state.autoPlacementSettings.wallSetupMode === 'full-wall-with-features'
                  ? state.autoPlacementSettings.wallFeatures
                  : []
              }
              selectedPieceId={activeSelectedPieceId}
              selectedFeatureId={selectedFeatureId}
              unit={state.unit}
              onAutoPlace={handleAutoPlace}
              onShuffle={handleShuffleAutoPlace}
              onOpenPlacementSettings={() => setSettingsDrawerOpen(true)}
              onSelect={togglePieceSelection}
              onFeatureSelect={toggleFeatureSelection}
              onPointerDown={handleStagedPiecePointerDown}
              onFeaturePointerDown={handleStagedFeaturePointerDown}
              onPlacePiece={placeStagedPiece}
              onRemovePiece={removePiece}
              onRemoveFeature={(featureId) =>
                updateAutoPlacementSettings({
                  ...state.autoPlacementSettings,
                  wallFeatures: state.autoPlacementSettings.wallFeatures.filter(
                    (feature) => feature.id !== featureId,
                  ),
                })
              }
            />
          </div>

          <MeasurementsTable instructions={measurements} />
        </section>
      </section>
      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label="Import JSON design file"
        onChange={importJson}
      />
      <AdvancedDrawer
        open={advancedDrawerOpen}
        themeMode={state.themeMode}
        applicationTheme={state.applicationTheme}
        features={state.features}
        unit={state.unit}
        message={state.message}
        autoPlacementFailure={autoPlacementFailure}
        readyToExport={readyToExport}
        exportIssues={allIssues}
        exporting={exporting}
        onClose={() => setAdvancedDrawerOpen(false)}
        onThemeModeChange={(themeMode) => {
          recordUndoSnapshot();
          setState((current) => ({ ...current, themeMode }));
        }}
        onApplicationThemeChange={(applicationTheme) => {
          recordUndoSnapshot();
          setState((current) => ({ ...current, applicationTheme }));
        }}
        onFeaturesChange={updateFeatures}
        onExportPng={exportPng}
        onExportPdf={exportPdf}
        onExportJson={exportJson}
        onImportClick={() => importInputRef.current?.click()}
        onUnitChange={updateUnit}
        onEditStart={beginFieldEdit}
        onEditEnd={finishFieldEdit}
      />
      <PlacementSettingsDrawer
        open={settingsDrawerOpen}
        settings={state.autoPlacementSettings}
        selectedFeatureId={selectedFeatureId}
        unit={state.unit}
        onClose={() => setSettingsDrawerOpen(false)}
        onSettingsChange={updateAutoPlacementSettings}
        onFeatureSelect={selectFeature}
        onUnitChange={updateUnit}
        onEditStart={beginFieldEdit}
        onEditEnd={finishFieldEdit}
      />
      <WallDragPreviewOverlay
        preview={wallDragPreview}
        artPieceBufferEnabled={state.features.artPieceBuffer}
        artPieceBufferGapIn={state.features.artPieceBufferGapIn}
      />
    </main>
  );
}

function getPieceLabel(state: GalleryState, pieceId: string): string {
  return state.pieces.find((piece) => piece.id === pieceId)?.label ?? 'Piece';
}

function startSuppressingTextSelection() {
  document.body.classList.add(SUPPRESS_TEXT_SELECTION_CLASS);
}

function stopSuppressingTextSelection() {
  document.body.classList.remove(SUPPRESS_TEXT_SELECTION_CLASS);
}
