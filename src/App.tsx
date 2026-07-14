import {
  ChevronDown,
  Download,
  FileImage,
  FileJson,
  FileText,
  Info,
  Maximize2,
  Move,
  PackageOpen,
  Plus,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
  Wand2,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { autoPlacePieces, type AutoPlacementDiagnostics } from './lib/autoPlace';
import {
  applicationThemeOptions,
  type ApplicationTheme,
  resolveApplicationTheme,
} from './lib/applicationTheme';
import { parseDesignFile, serializeDesignFile } from './lib/designFile';
import { downloadPdf, downloadSvgAsPng } from './lib/exportDesign';
import { buildMeasurementInstructions } from './lib/measurements';
import { getPlacementIssues } from './lib/placement';
import { applyPlacementFeatures } from './lib/snapping';
import {
  displaySizeValue,
  displayValue,
  formatMeasurement,
  parseMeasurement,
  roundToPrecision,
  roundToSizePrecision,
  toInches,
} from './lib/units';
import {
  applyWallSectionFeatures,
  getSectionOffsetY,
  getSectionById,
  getSectionOffsetX,
  getWallBounds,
  getWallExteriorEdges,
  getInsetWallExteriorPaths,
  getWallLayout,
  moveWallSection,
  normalizeWallSections,
  validateWallSections,
} from './lib/wall';
import { resolveWallFeatureRule } from './lib/wallFeatures';
import type {
  ArtPiece,
  AutoPlacementLayoutPreference,
  AutoPlacementSettings,
  EditorFeatures,
  HookSpec,
  Placement,
  ThemeMode,
  Unit,
  WallFeature,
  WallFeatureType,
  WallSection,
} from './types';

const STORAGE_KEY = 'gallery-designer-state-v1';
const STAGING_SCALE_PX_PER_IN = 4;
const DRAG_PREVIEW_SCALE_PX_PER_IN = 3;
const SUPPRESS_TEXT_SELECTION_CLASS = 'suppress-text-selection';
const DEFAULT_WALL_PADDING_IN = 14;
const DEFAULT_WALL_LABEL_GAP_IN = 10;
const MIN_WALL_ZOOM = 0.5;
const MAX_WALL_ZOOM = 4;
const ZOOM_BUTTON_FACTOR = 1.2;
const WALL_MOUSE_PAN_ID = -2;

interface GalleryState {
  unit: Unit;
  themeMode: ThemeMode;
  applicationTheme: ApplicationTheme;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  autoPlacementSettings: AutoPlacementSettings;
  selectedPieceId: string;
  message: string;
}

interface UndoableChangeOptions {
  undoable?: boolean;
}

interface DragState {
  pieceId: string;
  source: 'staging' | 'wall';
  startPoint: DOMPoint | null;
  startPlacement: Placement | null;
  latestPlacement: Placement | null;
  previewWidthPx: number;
  previewHeightPx: number;
}

interface SectionDragState {
  sectionId: string;
  startPoint: DOMPoint;
  startXIn: number;
  startYIn: number;
}

interface WallDragPreview {
  pieceId: string;
  clientX: number;
  clientY: number;
  widthPx: number;
  heightPx: number;
}

interface WallViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WallZoomState {
  scale: number;
  centerX: number;
  centerY: number;
}

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

type CursorInteraction = 'idle' | 'dragging-piece' | 'dragging-section' | 'panning-wall';

const defaultState: GalleryState = {
  unit: 'in',
  themeMode: 'system',
  applicationTheme: 'slate',
  sections: [
    {
      id: 'section-1',
      name: 'Section 1',
      widthIn: 96,
      heightIn: 84,
      cornerAfter: 'none',
      xIn: 0,
      yIn: 0,
    },
  ],
  pieces: [{ id: 'piece-1', label: 'Piece 1', widthIn: 16, heightIn: 20 }],
  placements: [],
  features: {
    snapToGrid: true,
    gridSizeIn: 1,
    snapToAlignment: true,
    alignmentToleranceIn: 1,
    wallEdgeBuffer: false,
    wallEdgeBufferGapIn: 2,
    artPieceBuffer: false,
    artPieceBufferGapIn: 2,
  },
  autoPlacementSettings: {
    wallSetupMode: 'available-sections',
    context: { kind: 'blank', viewingPosture: 'seated' },
    layoutPreference: 'auto',
    wallFeatures: [],
  },
  selectedPieceId: 'piece-1',
  message: 'Enter wall and art dimensions, then place pieces on the scaled wall.',
};

export default function App() {
  const [state, setState] = useState<GalleryState>(() => loadState());
  const [autoPlacementFailure, setAutoPlacementFailure] = useState<{
    message: string;
    diagnostics: AutoPlacementDiagnostics;
  } | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [wallDragPreview, setWallDragPreview] = useState<WallDragPreview | null>(null);
  const [undoState, setUndoState] = useState<GalleryState | null>(null);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const [cursorInteraction, setCursorInteraction] = useState<CursorInteraction>('idle');
  const [wallZoom, setWallZoom] = useState<WallZoomState>(() =>
    getDefaultWallZoomState(getWallCanvasBaseViewBox(defaultState.sections, defaultState.features)),
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wallDisplayRef = useRef<HTMLDivElement | null>(null);
  const clearMenuRef = useRef<HTMLDivElement | null>(null);
  const wallBaseViewBoxRef = useRef<WallViewBox | null>(null);
  const wallZoomRef = useRef(wallZoom);
  const wallViewBoxRef = useRef<WallViewBox | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const latestStateRef = useRef(state);
  const fieldEditUndoSnapshotRef = useRef<GalleryState | null>(null);
  const sectionDragUndoSnapshotRef = useRef<GalleryState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const sectionDragRef = useRef<SectionDragState | null>(null);
  const wallZoomGestureRef = useRef<WallZoomGesture | null>(null);
  const wallPanRef = useRef<WallPanState | null>(null);
  const interactionHandlersRef = useRef<{
    updateWallZoomGesture: (event: PointerEvent) => boolean;
    updateWallPan: (
      event: Pick<PointerEvent, 'clientX' | 'clientY'> & { pointerId?: number },
    ) => boolean;
    updateWallMousePan: (event: MouseEvent) => boolean;
    updateSectionDrag: (event: { clientX: number; clientY: number }) => boolean;
    updatePointerDrag: (event: { clientX: number; clientY: number }) => void;
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

  const wallIssues = useMemo(() => validateWallSections(state.sections), [state.sections]);
  const wallBaseViewBox = useMemo(
    () => getWallCanvasBaseViewBox(state.sections, state.features),
    [state.sections, state.features],
  );
  const wallViewBox = useMemo(
    () => getWallZoomedViewBox(wallBaseViewBox, wallZoom),
    [wallBaseViewBox, wallZoom],
  );
  wallBaseViewBoxRef.current = wallBaseViewBox;
  wallZoomRef.current = wallZoom;
  wallViewBoxRef.current = wallViewBox;
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
    () => buildMeasurementInstructions(state.sections, state.pieces, state.placements, state.unit),
    [state.sections, state.pieces, state.placements, state.unit],
  );
  const selectedPiece = state.pieces.find((piece) => piece.id === state.selectedPieceId);
  const selectedPlacement = state.placements.find(
    (placement) => placement.pieceId === state.selectedPieceId,
  );
  const readyToExport = allIssues.length === 0 && state.pieces.length > 0;

  interactionHandlersRef.current = {
    updateWallZoomGesture,
    updateWallPan,
    updateWallMousePan,
    updateSectionDrag,
    updatePointerDrag,
    finishPieceDrag,
    finishWallPan,
    finishWallMousePan,
    handleWallWheelInput,
    handleCanvasKeyDown,
  };

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      const drag = dragRef.current;
      if (drag) {
        event.preventDefault();
        handlers.updatePointerDrag(event);
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      interactionHandlersRef.current?.finishPieceDrag(event);
      interactionHandlersRef.current?.finishWallPan(event);
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
      interactionHandlersRef.current?.handleCanvasKeyDown(event);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const canvas = svg;

    function handleNativePointerDown(event: PointerEvent) {
      if (
        event.button !== 0 ||
        dragRef.current ||
        sectionDragRef.current ||
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
      if (interactionHandlersRef.current?.updateWallPan(event)) {
        event.preventDefault();
      }
    }

    function handleNativePointerUp(event: PointerEvent) {
      interactionHandlersRef.current?.finishWallPan(event);
    }

    function handleNativeMouseDown(event: MouseEvent) {
      if (
        event.button !== 0 ||
        dragRef.current ||
        sectionDragRef.current ||
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
  }, []);

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

      event.preventDefault();
      event.stopPropagation();
      interactionHandlersRef.current?.handleWallWheelInput(event);
    }

    displayPanel.addEventListener('wheel', handleDisplayWheel, { passive: false });
    return () => displayPanel.removeEventListener('wheel', handleDisplayWheel);
  }, []);

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
    setState((current) => ({ ...current, selectedPieceId: pieceId }));
  }

  function togglePieceSelection(pieceId: string) {
    setState((current) => ({
      ...current,
      selectedPieceId: current.selectedPieceId === pieceId ? '' : pieceId,
    }));
  }

  function selectSection(sectionId: string) {
    setSelectedSectionId(sectionId);
  }

  function toggleSectionSelection(sectionId: string) {
    setSelectedSectionId((current) => (current === sectionId ? '' : sectionId));
  }

  function clearSelection() {
    setSelectedSectionId('');
    setState((current) => ({ ...current, selectedPieceId: '' }));
  }

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

  function recordUndoSnapshot(snapshot = latestStateRef.current) {
    setUndoState(snapshot);
  }

  function beginFieldEdit() {
    fieldEditUndoSnapshotRef.current ??= latestStateRef.current;
  }

  function finishFieldEdit() {
    const snapshot = fieldEditUndoSnapshotRef.current;
    fieldEditUndoSnapshotRef.current = null;
    if (snapshot && hasUndoableChange(snapshot, latestStateRef.current)) {
      recordUndoSnapshot(snapshot);
    }
  }

  function handlePagePointerDown(event: React.PointerEvent<HTMLElement>) {
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
    setState((current) => {
      const index = current.sections.length + 1;
      const normalizedSections = normalizeWallSections(current.sections);
      const previousSection = normalizedSections.at(-1);
      return {
        ...current,
        sections: [
          ...normalizedSections,
          {
            id: `section-${index}`,
            name: `Section ${index}`,
            widthIn: previousSection?.widthIn ?? 96,
            heightIn: previousSection?.heightIn ?? 84,
            cornerAfter: 'none',
            xIn: previousSection ? (previousSection.xIn ?? 0) + previousSection.widthIn : 0,
            yIn: previousSection?.yIn ?? 0,
          },
        ],
      };
    });
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
        return { ...current, message: 'At least one wall section is required.' };
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
        selectedPieceId: piece.id,
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
      return {
        ...current,
        pieces: nextPieces,
        placements: current.placements.filter((placement) => placement.pieceId !== pieceId),
        selectedPieceId: nextPieces[0]?.id ?? '',
      };
    });
  }

  function applyFeatures(current: GalleryState, placement: Placement): Placement {
    const piece = current.pieces.find((candidate) => candidate.id === placement.pieceId);
    if (!piece) {
      return placement;
    }
    return applyPlacementFeatures({
      placement,
      piece,
      sections: current.sections,
      pieces: current.pieces,
      placements: current.placements,
      features: current.features,
    });
  }

  function commitPiecePlacement(proposedPlacement: Placement) {
    recordUndoSnapshot();
    setState((current) => {
      const section = getSectionById(current.sections, proposedPlacement.sectionId);
      const piece = current.pieces.find((candidate) => candidate.id === proposedPlacement.pieceId);
      if (!section) {
        return current;
      }
      const placement = applyFeatures(current, proposedPlacement);

      return {
        ...current,
        selectedPieceId: placement.pieceId,
        placements: [
          ...current.placements.filter((candidate) => candidate.pieceId !== placement.pieceId),
          placement,
        ],
        message:
          piece && section
            ? `Placed ${piece.label} on ${section.name}.`
            : 'Placed a piece on the wall.',
      };
    });
  }

  function nudgePiece(proposedPlacement: Placement) {
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      selectedPieceId: proposedPlacement.pieceId,
      placements: [
        ...current.placements.filter(
          (candidate) => candidate.pieceId !== proposedPlacement.pieceId,
        ),
        proposedPlacement,
      ],
      message: `Moved ${getPieceLabel(current, proposedPlacement.pieceId)} on the wall.`,
    }));
  }

  function clearPlacedArt() {
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      placements: [],
      selectedPieceId: current.pieces[0]?.id ?? '',
      message: 'Cleared placed art. All pieces returned to the staging tray.',
    }));
  }

  function clearWallSections() {
    recordUndoSnapshot();
    setSelectedSectionId('');
    setState((current) => ({
      ...current,
      sections: [],
      placements: [],
      message: 'Cleared wall sections. Add at least one wall section before placing art.',
    }));
  }

  function clearWallFeatures() {
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      autoPlacementSettings: {
        ...current.autoPlacementSettings,
        wallFeatures: [],
      },
      message: 'Cleared furniture and wall features.',
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
    setState({
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
      selectedPieceId: '',
      message: 'Reset the entire design. Add wall sections and art pieces to start over.',
    });
    setWallZoom(getDefaultWallZoomState(getWallCanvasBaseViewBox([], defaultState.features)));
  }

  function runClearAction(action: () => void) {
    setClearMenuOpen(false);
    action();
  }

  function fitWallZoom() {
    setWallZoom(getDefaultWallZoomState(wallBaseViewBox));
    wallZoomGestureRef.current = null;
    wallPanRef.current = null;
    setCursorInteraction((current) => (current === 'panning-wall' ? 'idle' : current));
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
    focusPoint?: Pick<React.PointerEvent | PointerEvent | React.WheelEvent, 'clientX' | 'clientY'>,
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
      message: 'Updated snapping and buffer settings.',
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
      message: 'Updated auto-placement settings.',
    }));
  }

  function removePlacement(pieceId: string) {
    recordUndoSnapshot();
    setState((current) => ({
      ...current,
      selectedPieceId: pieceId,
      placements: current.placements.filter((placement) => placement.pieceId !== pieceId),
      message: `Returned ${getPieceLabel(current, pieceId)} to the staging tray.`,
    }));
  }

  function handleWallPointerDownCapture(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'touch') {
      if (wallZoom.scale > 1 && isWallPanTarget(event.target)) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          event.preventDefault();
          startWallPan(event, getPointerId(event), rect);
        }
      }
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

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

  function handleWallWheelInput(event: {
    altKey: boolean;
    clientX: number;
    clientY: number;
    ctrlKey: boolean;
    deltaMode: number;
    deltaX: number;
    deltaY: number;
    metaKey: boolean;
  }) {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      panWallByWheel(event);
      return;
    }

    const baseViewBox = wallBaseViewBoxRef.current;
    if (!baseViewBox) {
      return;
    }

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
  }

  function handleWallPanPointerDown(event: React.PointerEvent<SVGRectElement>) {
    if (
      wallZoom.scale <= 1 ||
      (typeof event.button === 'number' && event.button !== 0) ||
      dragRef.current ||
      sectionDragRef.current ||
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
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    startWallPan(event, getPointerId(event), rect);
  }

  function handleWallPanMouseDown(event: React.MouseEvent<SVGRectElement>) {
    if (
      wallZoom.scale <= 1 ||
      event.button !== 0 ||
      dragRef.current ||
      sectionDragRef.current ||
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
    setCursorInteraction('panning-wall');
    startSuppressingTextSelection();
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

  function handleStagedPiecePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    pieceId: string,
  ) {
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
      pieceId,
      source: 'staging',
      startPoint: null,
      startPlacement: null,
      latestPlacement: placement,
      previewWidthPx: size.widthPx,
      previewHeightPx: size.heightPx,
    };
    setCursorInteraction('dragging-piece');
    startSuppressingTextSelection();
    showSnappedPreview(placement, piece, size, event);
  }

  function handleSectionPointerDown(
    event: React.PointerEvent<SVGRectElement>,
    section: WallSection,
  ) {
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    startSectionDrag(event, section);
  }

  function handleSectionMouseDown(event: React.MouseEvent<SVGRectElement>, section: WallSection) {
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
    sectionDragUndoSnapshotRef.current = latestStateRef.current;
    sectionDragRef.current = {
      sectionId: section.id,
      startPoint: point,
      startXIn: getSectionOffsetX(state.sections, section.id),
      startYIn: getSectionOffsetY(state.sections, section.id),
    };
    setCursorInteraction('dragging-section');
    startSuppressingTextSelection();
  }

  function handleAutoPlace() {
    const result = autoPlacePieces(state.sections, state.pieces, {
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
      setState((current) => ({ ...current, message: result.message }));
      return;
    }

    setAutoPlacementFailure(null);
    if (result.newPlacementCount === 0) {
      setState((current) => ({
        ...current,
        message: result.explanation ?? 'Auto-placement made no changes.',
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
      selectedPieceId: firstNewPlacement?.pieceId ?? current.selectedPieceId,
      message:
        result.preservedPlacementCount > 0
          ? `Auto-placement placed ${formatCount(result.newPlacementCount, 'remaining piece')} around ${formatCount(result.preservedPlacementCount, 'piece')} you positioned. Existing pieces were not moved.`
          : (result.explanation ?? `Auto-placement created a ${result.layoutKind} layout.`),
    }));
  }

  function undoLastChange() {
    if (!undoState) {
      return;
    }
    setState({ ...undoState, message: 'Restored the previous change.' });
    setUndoState(null);
  }

  function handlePointerDown(event: React.PointerEvent<SVGRectElement>, placement: Placement) {
    event.preventDefault();
    const point = clientPointToSvg(event);
    if (!point || !svgRef.current) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pieceId: placement.pieceId,
      source: 'wall',
      startPoint: point,
      startPlacement: placement,
      latestPlacement: placement,
      previewWidthPx: rect.width,
      previewHeightPx: rect.height,
    };
    setCursorInteraction('dragging-piece');
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    startSuppressingTextSelection();
    showSnappedPreview(
      placement,
      state.pieces.find((piece) => piece.id === placement.pieceId),
      { widthPx: rect.width, heightPx: rect.height },
      event,
    );
    setState((current) => ({ ...current, selectedPieceId: placement.pieceId }));
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
    setState((current) => ({
      ...current,
      sections: moveWallSection(
        current.sections,
        sectionDrag.sectionId,
        applyWallSectionFeatures(
          current.sections,
          sectionDrag.sectionId,
          proposed,
          current.features,
        ),
      ),
      message: 'Wall section moved. Sections snap together by shared edges.',
    }));
    return true;
  }

  function handlePointerUp(event?: React.PointerEvent<SVGSVGElement>) {
    finishPieceDrag(event);
    finishWallPan(event);
  }

  function finishPieceDrag(event?: { clientX: number; clientY: number; pointerId?: number }) {
    finishWallZoomGesture(event);
    const drag = dragRef.current;
    if (drag && event && pointerIsOverStagingTray(event)) {
      removePlacement(drag.pieceId);
    } else if (
      drag?.latestPlacement &&
      (drag.source === 'wall' || (event && pointerIsOverWallCanvas(event)))
    ) {
      commitPiecePlacement(drag.latestPlacement);
    }
    const sectionDragSnapshot = sectionDragUndoSnapshotRef.current;
    if (sectionDragSnapshot && hasUndoableChange(sectionDragSnapshot, latestStateRef.current)) {
      recordUndoSnapshot(sectionDragSnapshot);
    }
    dragRef.current = null;
    sectionDragRef.current = null;
    sectionDragUndoSnapshotRef.current = null;
    setCursorInteraction('idle');
    setWallDragPreview(null);
    stopSuppressingTextSelection();
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
      setCursorInteraction('idle');
      stopSuppressingTextSelection();
    }
  }

  function finishWallMousePan() {
    const pan = wallPanRef.current;
    if (!pan || pan.pointerId !== WALL_MOUSE_PAN_ID) {
      return;
    }
    wallPanRef.current = null;
    setCursorInteraction('idle');
    stopSuppressingTextSelection();
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

  function panWallByWheel(event: { deltaMode: number; deltaX: number; deltaY: number }) {
    const rect = svgRef.current?.getBoundingClientRect();
    const baseViewBox = wallBaseViewBoxRef.current;
    if (!rect || rect.width <= 0 || rect.height <= 0 || !baseViewBox) {
      return;
    }

    const delta = normalizeWheelDelta(event);
    setWallZoom((current) => {
      const currentViewBox = getWallZoomedViewBox(baseViewBox, current);
      const nextCenter = clampWallZoomCenter(
        baseViewBox,
        currentViewBox.width,
        currentViewBox.height,
        current.centerX + (delta.x / rect.width) * currentViewBox.width,
        current.centerY + (delta.y / rect.height) * currentViewBox.height,
      );
      return {
        ...current,
        centerX: nextCenter.centerX,
        centerY: nextCenter.centerY,
      };
    });
  }

  function pointerIsOverStagingTray(
    event: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>,
  ): boolean {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element?.closest('[aria-label="Art staging tray"]') !== null;
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
    if (event.target instanceof Element && event.target.closest('svg [role="button"]')) {
      return;
    }
    if (!selectedPiece || !selectedPlacement) {
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
    nudgePiece({
      ...selectedPlacement,
      xIn: roundToPrecision(selectedPlacement.xIn + delta[0]),
      yIn: roundToPrecision(selectedPlacement.yIn + delta[1]),
    });
  }

  function handleSectionKeyDown(event: React.KeyboardEvent<SVGRectElement>, section: WallSection) {
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
    setState((current) => ({
      ...current,
      sections: moveWallSection(
        current.sections,
        section.id,
        applyWallSectionFeatures(
          current.sections,
          section.id,
          { xIn: (section.xIn ?? 0) + delta[0], yIn: (section.yIn ?? 0) + delta[1] },
          current.features,
        ),
      ),
      message: 'Wall section moved. Sections snap together by shared edges.',
    }));
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
    nudgePiece({
      ...placement,
      xIn: roundToPrecision(placement.xIn + deltaX),
      yIn: roundToPrecision(placement.yIn + deltaY),
    });
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

  function updatePointerDrag(event: { clientX: number; clientY: number }) {
    const drag = dragRef.current;
    const point = clientPointToSvg(event);
    if (!drag || !point) {
      return;
    }

    const piece = state.pieces.find((candidate) => candidate.id === drag.pieceId);
    if (!piece) {
      return;
    }

    if (drag.source === 'staging') {
      drag.latestPlacement = getPointerPlacement(event, piece);
    } else if (drag.startPlacement && drag.startPoint) {
      drag.latestPlacement = {
        ...drag.startPlacement,
        xIn: roundToPrecision(drag.startPlacement.xIn + point.x - drag.startPoint.x),
        yIn: roundToPrecision(drag.startPlacement.yIn + point.y - drag.startPoint.y),
      };
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

    const snappedPlacement = applyFeatures(state, placement);
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
      pieceId: piece.id,
      clientX: clientPoint?.x ?? fallbackPoint.clientX,
      clientY: clientPoint?.y ?? fallbackPoint.clientY,
      widthPx: size.widthPx,
      heightPx: size.heightPx,
    });
  }

  function getRenderedPieceSize(piece: ArtPiece): { widthPx: number; heightPx: number } {
    const svg = svgRef.current;
    const viewBox = svg?.viewBox.baseVal;
    const rect = svg?.getBoundingClientRect();

    if (viewBox && rect && viewBox.width > 0 && viewBox.height > 0) {
      const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
      if (Number.isFinite(scale) && scale > 0) {
        return {
          widthPx: piece.widthIn * scale,
          heightPx: piece.heightIn * scale,
        };
      }
    }

    return {
      widthPx: piece.widthIn * DRAG_PREVIEW_SCALE_PX_PER_IN,
      heightPx: piece.heightIn * DRAG_PREVIEW_SCALE_PX_PER_IN,
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

  async function exportPng() {
    if (!svgRef.current) {
      return;
    }
    await downloadSvgAsPng(svgRef.current, 'gallery-wall-layout.png');
    setState((current) => ({ ...current, message: 'PNG export generated.' }));
  }

  async function exportPdf() {
    if (!svgRef.current) {
      return;
    }
    await downloadPdf(svgRef.current, measurements, allIssues);
    setState((current) => ({ ...current, message: 'PDF export generated.' }));
  }

  function exportJson() {
    const json = serializeDesignFile(state);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gallery-wall-design.json';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setState((current) => ({ ...current, message: 'JSON design file exported.' }));
  }

  async function importJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const imported = parseDesignFile(await file.text());
      recordUndoSnapshot();
      setState({
        ...defaultState,
        ...imported,
        message: 'JSON design file imported.',
      });
      setSelectedSectionId('');
    } catch (error) {
      setState((current) => ({
        ...current,
        message: error instanceof Error ? error.message : 'Could not import the design file.',
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
      <header className="topbar">
        <div className="brand-lockup">
          <BrandLogo />
          <div className="brand-copy">
            <h1>Gallery Designer</h1>
            <p>Plan a continuous wall, place art to scale, and export installation measurements.</p>
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="setup-panel" aria-label="Setup controls">
          <CollapsiblePanel
            icon={<Ruler size={18} />}
            title={`Wall sections (${state.sections.length})`}
            ariaLabel="Wall section settings"
            className="setup-utility-panel wall-sections-panel"
            contentClassName="wall-sections-panel-content"
          >
            <div className="section-list">
              {state.sections.map((section, index) => (
                <article
                  className={`setup-row section-row ${
                    section.id === selectedSectionId ? 'selected' : ''
                  }`}
                  key={section.id}
                  onClick={() => toggleSectionSelection(section.id)}
                >
                  <div className="row-heading">
                    <input
                      aria-label={`Section ${index + 1} name`}
                      value={section.name}
                      onFocus={beginFieldEdit}
                      onBlur={finishFieldEdit}
                      onChange={(event) => updateSection(section.id, { name: event.target.value })}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove Section ${index + 1}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSection(section.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="field-grid">
                    <NumberField
                      label={`Section ${index + 1} width`}
                      valueIn={section.widthIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(section.widthIn) || section.widthIn <= 0
                          ? `${section.name} needs a positive width.`
                          : undefined
                      }
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(widthIn) => updateSection(section.id, { widthIn })}
                    />
                    <NumberField
                      label={`Section ${index + 1} height`}
                      valueIn={section.heightIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(section.heightIn) || section.heightIn <= 0
                          ? `${section.name} needs a positive height.`
                          : undefined
                      }
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(heightIn) => updateSection(section.id, { heightIn })}
                    />
                  </div>
                  <label className="field">
                    Corner after
                    <select
                      aria-label={`Section ${index + 1} corner after`}
                      value={section.cornerAfter}
                      onChange={(event) => {
                        recordUndoSnapshot();
                        updateSection(section.id, {
                          cornerAfter: event.target.value as WallSection['cornerAfter'],
                        });
                      }}
                    >
                      <option value="none">None / end</option>
                      <option value="left">Turns left</option>
                      <option value="right">Turns right</option>
                    </select>
                  </label>
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
            title={`Art pieces (${state.pieces.length})`}
            ariaLabel="Art piece settings"
            className="setup-utility-panel art-pieces-panel"
            contentClassName="art-pieces-panel-content"
          >
            <div className="piece-list">
              {state.pieces.map((piece, index) => (
                <article
                  className={`setup-row piece-row ${
                    piece.id === state.selectedPieceId ? 'selected' : ''
                  }`}
                  key={piece.id}
                  onClick={(event) => {
                    if (
                      event.target instanceof HTMLElement &&
                      event.target.closest('input, select, button')
                    ) {
                      return;
                    }
                    togglePieceSelection(piece.id);
                  }}
                >
                  <div className="row-heading">
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
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove Piece ${index + 1}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removePiece(piece.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="field-grid">
                    <NumberField
                      label={`Piece ${index + 1} width`}
                      valueIn={piece.widthIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(piece.widthIn) || piece.widthIn <= 0
                          ? `${piece.label} needs a positive width.`
                          : undefined
                      }
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(widthIn) => updatePiece(piece.id, { widthIn })}
                    />
                    <NumberField
                      label={`Piece ${index + 1} height`}
                      valueIn={piece.heightIn}
                      unit={state.unit}
                      precision="size"
                      error={
                        !Number.isFinite(piece.heightIn) || piece.heightIn <= 0
                          ? `${piece.label} needs a positive height.`
                          : undefined
                      }
                      onEditStart={beginFieldEdit}
                      onEditEnd={finishFieldEdit}
                      onChange={(heightIn) => updatePiece(piece.id, { heightIn })}
                    />
                  </div>
                  <HookControls
                    piece={piece}
                    unit={state.unit}
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

        <section className="editor-column">
          <div className="editor-toolbar" role="toolbar" aria-label="Editor controls">
            <div className="toolbar-group" role="group" aria-label="Placement controls">
              <label className="field compact">
                Units
                <select
                  value={state.unit}
                  onChange={(event) => {
                    recordUndoSnapshot();
                    setState((current) => ({ ...current, unit: event.target.value as Unit }));
                  }}
                >
                  <option value="in">Inches</option>
                  <option value="cm">Centimeters</option>
                </select>
              </label>
              <button type="button" className="primary" onClick={handleAutoPlace}>
                <Wand2 size={18} />
                Auto-place pieces
              </button>
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
            <div
              className="toolbar-group appearance-controls"
              role="group"
              aria-label="Appearance controls"
            >
              <label className="field compact">
                Appearance
                <select
                  value={state.themeMode}
                  onChange={(event) => {
                    recordUndoSnapshot();
                    setState((current) => ({
                      ...current,
                      themeMode: event.target.value as ThemeMode,
                    }));
                  }}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="field compact">
                Theme
                <select
                  value={state.applicationTheme}
                  onChange={(event) => {
                    recordUndoSnapshot();
                    setState((current) => ({
                      ...current,
                      applicationTheme: resolveApplicationTheme(event.target.value),
                    }));
                  }}
                >
                  {applicationThemeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="canvas-card" ref={wallDisplayRef}>
            <div className="wall-canvas-shell">
              <WallCanvas
                svgRef={svgRef}
                sections={state.sections}
                pieces={state.pieces}
                placements={state.placements}
                selectedPieceId={state.selectedPieceId}
                selectedSectionId={selectedSectionId}
                autoPlacementSettings={state.autoPlacementSettings}
                features={state.features}
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
                onPieceKeyDown={handlePieceKeyDown}
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
              selectedPieceId={state.selectedPieceId}
              unit={state.unit}
              onSelect={togglePieceSelection}
              onPointerDown={handleStagedPiecePointerDown}
            />
          </div>

          <MeasurementsTable instructions={measurements} />
        </section>

        <aside className="right-panel" aria-label="Details and export">
          <CollapsiblePanel
            icon={<Wand2 size={18} />}
            title="Auto-placement"
            ariaLabel="Auto-placement settings"
          >
            <AutoPlacementControls
              settings={state.autoPlacementSettings}
              unit={state.unit}
              onChange={updateAutoPlacementSettings}
              onEditStart={beginFieldEdit}
              onEditEnd={finishFieldEdit}
            />
          </CollapsiblePanel>
          <CollapsiblePanel
            icon={<SlidersHorizontal size={18} />}
            title="Features"
            ariaLabel="Feature settings"
          >
            <FeatureControls
              features={state.features}
              unit={state.unit}
              onChange={updateFeatures}
              onEditStart={beginFieldEdit}
              onEditEnd={finishFieldEdit}
            />
          </CollapsiblePanel>
          <section className="status-panel" aria-label="Latest update">
            <p className="status-panel-label">Latest update</p>
            <div className="status-content" role="status" aria-live="polite">
              <p className="status-message">{state.message}</p>
              {autoPlacementFailure?.message === state.message ? (
                <AutoPlacementFailureDetails
                  diagnostics={autoPlacementFailure.diagnostics}
                  unit={state.unit}
                />
              ) : null}
            </div>
          </section>
          <ExportPanel
            ready={readyToExport}
            issues={allIssues}
            onExportPng={exportPng}
            onExportPdf={exportPdf}
            onExportJson={exportJson}
            onImportClick={() => importInputRef.current?.click()}
          />
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            aria-label="Import JSON design file"
            onChange={importJson}
          />
        </aside>
      </section>
      <WallDragPreviewOverlay
        preview={wallDragPreview}
        piece={state.pieces.find((piece) => piece.id === wallDragPreview?.pieceId)}
        artPieceBufferEnabled={state.features.artPieceBuffer}
        artPieceBufferGapIn={state.features.artPieceBufferGapIn}
      />
    </main>
  );
}

function AutoPlacementFailureDetails({
  diagnostics,
  unit,
}: {
  diagnostics: AutoPlacementDiagnostics;
  unit: Unit;
}) {
  return (
    <div className="auto-placement-diagnostics">
      {diagnostics.preservedPlacementCount > 0 ? (
        <p>
          {formatCount(diagnostics.preservedPlacementCount, 'fixed piece')} reduced the space
          available for {formatCount(diagnostics.remainingPieceCount, 'remaining piece')}.
        </p>
      ) : null}
      {diagnostics.attempts.length > 0 ? (
        <>
          <p>
            Tried {diagnostics.attempts.length} layout strategies with{' '}
            {formatMeasurement(diagnostics.resolvedGapIn, unit)} spacing and a{' '}
            {formatMeasurement(diagnostics.resolvedOuterMarginIn, unit)} wall margin.
          </p>
          <ul>
            {diagnostics.attempts.map((attempt) => (
              <li key={attempt.family}>
                <strong>{capitalize(attempt.family)}:</strong> {attempt.reason}
                {attempt.requiredWidthIn !== undefined && attempt.requiredHeightIn !== undefined ? (
                  <span>
                    {' '}
                    Needs {formatMeasurement(attempt.requiredWidthIn, unit)} wide x{' '}
                    {formatMeasurement(attempt.requiredHeightIn, unit)} tall including margins; wall
                    bounds are {formatMeasurement(diagnostics.wallWidthIn, unit)} x{' '}
                    {formatMeasurement(diagnostics.wallHeightIn, unit)}.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 56 48" aria-hidden="true" focusable="false">
      <path
        d="M3 3h50v25H31v17H3z"
        fill="var(--piece-selected-fill)"
        stroke="var(--wall-edge)"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <rect
        x="9"
        y="9"
        width="11"
        height="13"
        rx="1.5"
        fill="var(--piece-fill)"
        stroke="var(--primary-background)"
        strokeWidth="2.5"
      />
      <rect
        x="26"
        y="9"
        width="19"
        height="11"
        rx="1.5"
        fill="var(--piece-fill)"
        stroke="var(--primary-background)"
        strokeWidth="2.5"
      />
      <rect
        x="9"
        y="28"
        width="15"
        height="10"
        rx="1.5"
        fill="var(--piece-fill)"
        stroke="var(--primary-background)"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function getPieceLabel(state: GalleryState, pieceId: string): string {
  return state.pieces.find((piece) => piece.id === pieceId)?.label ?? 'Piece';
}

function shouldKeepSelection(target: EventTarget): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        'button',
        'input',
        'select',
        'textarea',
        '.setup-row',
        '.wall-section',
        '.piece rect',
        '.staged-piece',
      ].join(','),
    ),
  );
}

function isWallPanTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && Boolean(target.closest('.wall-pan-surface, .wall-exterior-edge'))
  );
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, select, textarea'));
}

function WallDragPreviewOverlay({
  preview,
  piece,
  artPieceBufferEnabled,
  artPieceBufferGapIn,
}: {
  preview: WallDragPreview | null;
  piece?: ArtPiece;
  artPieceBufferEnabled: boolean;
  artPieceBufferGapIn: number;
}) {
  if (!preview || !piece) {
    return null;
  }

  const label = fitPieceLabel(piece.label, piece.widthIn, piece.heightIn);
  const bufferGapPx = artPieceBufferEnabled
    ? getPreviewBufferGapPx(piece, preview, artPieceBufferGapIn)
    : 0;
  const previewStyle: React.CSSProperties & { '--art-piece-buffer-gap'?: string } = {
    left: `${preview.clientX}px`,
    top: `${preview.clientY}px`,
    width: `${preview.widthPx}px`,
    height: `${preview.heightPx}px`,
  };
  if (bufferGapPx > 0 || label.placement === 'outside') {
    previewStyle.overflow = 'visible';
  }
  if (bufferGapPx > 0) {
    previewStyle['--art-piece-buffer-gap'] = `${bufferGapPx}px`;
  }

  return (
    <div
      className={
        bufferGapPx > 0 ? 'wall-drag-preview art-piece-buffer-preview' : 'wall-drag-preview'
      }
      data-testid="wall-drag-preview"
      style={previewStyle}
    >
      <svg
        className="wall-drag-preview-svg"
        viewBox={`0 0 ${piece.widthIn} ${piece.heightIn}`}
        aria-hidden="true"
        focusable="false"
      >
        <g className="piece selected">
          <rect x="0" y="0" width={piece.widthIn} height={piece.heightIn} rx="0.8" />
          <PieceLabelSvg piece={piece} offsetX={0} offsetY={0} clipId={`preview-${piece.id}`} />
        </g>
      </svg>
    </div>
  );
}

function startSuppressingTextSelection() {
  document.body.classList.add(SUPPRESS_TEXT_SELECTION_CLASS);
}

function stopSuppressingTextSelection() {
  document.body.classList.remove(SUPPRESS_TEXT_SELECTION_CLASS);
}

function getPreviewBufferGapPx(
  piece: ArtPiece,
  size: { widthPx: number; heightPx: number },
  gapIn: number,
): number {
  if (gapIn <= 0) {
    return 0;
  }

  const scales = [size.widthPx / piece.widthIn, size.heightPx / piece.heightIn].filter(
    (scale) => Number.isFinite(scale) && scale > 0,
  );
  return scales.length > 0 ? Math.min(...scales) * gapIn : 0;
}

function getWallCanvasBaseViewBox(sections: WallSection[], features: EditorFeatures): WallViewBox {
  const wallBounds = getWallBounds(sections);
  const bufferPadding = features.wallEdgeBuffer ? features.wallEdgeBufferGapIn : 0;
  const padding = DEFAULT_WALL_PADDING_IN + bufferPadding;
  return {
    x: wallBounds.minX - padding,
    y: wallBounds.minY - padding,
    width: Math.max(1, wallBounds.width + padding * 2),
    height: Math.max(1, wallBounds.height + padding * 2 + DEFAULT_WALL_LABEL_GAP_IN),
  };
}

function getDefaultWallZoomState(baseViewBox: WallViewBox): WallZoomState {
  return {
    scale: 1,
    centerX: baseViewBox.x + baseViewBox.width / 2,
    centerY: baseViewBox.y + baseViewBox.height / 2,
  };
}

function getWallZoomedViewBox(baseViewBox: WallViewBox, zoom: WallZoomState): WallViewBox {
  const scale = clampWallZoomScale(zoom.scale);
  const width = baseViewBox.width / scale;
  const height = baseViewBox.height / scale;
  return {
    x: zoom.centerX - width / 2,
    y: zoom.centerY - height / 2,
    width,
    height,
  };
}

function zoomWallStateAroundPoint(
  baseViewBox: WallViewBox,
  currentViewBox: WallViewBox,
  nextScale: number,
  focusPoint?: { x: number; y: number } | null,
): WallZoomState {
  const scale = clampWallZoomScale(nextScale);
  const nextWidth = baseViewBox.width / scale;
  const nextHeight = baseViewBox.height / scale;
  const focus = focusPoint ?? {
    x: currentViewBox.x + currentViewBox.width / 2,
    y: currentViewBox.y + currentViewBox.height / 2,
  };
  const relativeX = (focus.x - currentViewBox.x) / Math.max(0.01, currentViewBox.width);
  const relativeY = (focus.y - currentViewBox.y) / Math.max(0.01, currentViewBox.height);

  return {
    scale,
    ...clampWallZoomCenter(
      baseViewBox,
      nextWidth,
      nextHeight,
      focus.x + (0.5 - relativeX) * nextWidth,
      focus.y + (0.5 - relativeY) * nextHeight,
    ),
  };
}

function clampWallZoomScale(scale: number): number {
  return Math.min(MAX_WALL_ZOOM, Math.max(MIN_WALL_ZOOM, scale));
}

function clampWallZoomCenter(
  baseViewBox: WallViewBox,
  viewBoxWidth: number,
  viewBoxHeight: number,
  centerX: number,
  centerY: number,
): Pick<WallZoomState, 'centerX' | 'centerY'> {
  return {
    centerX: clampViewBoxCenter(baseViewBox.x, baseViewBox.width, viewBoxWidth, centerX),
    centerY: clampViewBoxCenter(baseViewBox.y, baseViewBox.height, viewBoxHeight, centerY),
  };
}

function clampViewBoxCenter(
  baseStart: number,
  baseSize: number,
  viewBoxSize: number,
  center: number,
): number {
  if (viewBoxSize >= baseSize) {
    return baseStart + baseSize / 2;
  }

  const minCenter = baseStart + viewBoxSize / 2;
  const maxCenter = baseStart + baseSize - viewBoxSize / 2;
  return Math.min(maxCenter, Math.max(minCenter, center));
}

function normalizeWheelDelta(event: { deltaMode: number; deltaX: number; deltaY: number }): {
  x: number;
  y: number;
} {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
  return {
    x: event.deltaX * unit,
    y: event.deltaY * unit,
  };
}

function getPointerId(event: { pointerId?: number }): number {
  return Number.isFinite(event.pointerId) ? Number(event.pointerId) : -1;
}

function distanceBetween(
  first: { clientX: number; clientY: number },
  second: { clientX: number; clientY: number },
) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function midpointBetween(
  first: { clientX: number; clientY: number },
  second: { clientX: number; clientY: number },
) {
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
  };
}

function getUnplacedPieceIssues(pieces: ArtPiece[], placements: Placement[]): string[] {
  const placedPieceIds = new Set(placements.map((placement) => placement.pieceId));
  const countsByLabel = new Map<string, number>();

  for (const piece of pieces) {
    if (!placedPieceIds.has(piece.id)) {
      countsByLabel.set(piece.label, (countsByLabel.get(piece.label) ?? 0) + 1);
    }
  }

  return [...countsByLabel.entries()].map(([label, count]) =>
    count === 1
      ? `${label} has not been placed.`
      : `${count} pieces named ${label} have not been placed.`,
  );
}

function CollapsiblePanel({
  icon,
  title,
  ariaLabel,
  defaultExpanded = true,
  className = '',
  contentClassName = '',
  children,
}: {
  icon: React.ReactNode;
  title: string;
  ariaLabel: string;
  defaultExpanded?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <section
      className={`utility-panel feature-panel collapsible-panel ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="collapsible-panel-trigger"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="panel-title">
          {icon}
          <h2>{title}</h2>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          focusable="false"
          className={expanded ? 'collapsible-panel-caret' : 'collapsible-panel-caret collapsed'}
        />
      </button>
      <div
        id={contentId}
        className={`collapsible-panel-content ${contentClassName}`.trim()}
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}

function NumberField({
  label,
  valueIn,
  unit,
  precision = 'position',
  disabled = false,
  error,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  label: string;
  valueIn: number;
  unit: Unit;
  precision?: 'position' | 'size';
  disabled?: boolean;
  error?: string;
  onChange: (valueIn: number) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}) {
  const display =
    precision === 'size' ? displaySizeValue(valueIn, unit) : displayValue(valueIn, unit);
  const round = precision === 'size' ? roundToSizePrecision : roundToPrecision;
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);
  const errorId = useId();

  useEffect(() => {
    if (!focused) {
      setDraft(display);
    }
  }, [display, focused]);

  return (
    <label className="field">
      {label}
      <input
        aria-label={label}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        inputMode="decimal"
        value={draft}
        onFocus={() => {
          onEditStart?.();
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          setDraft(display);
          onEditEnd?.();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next === '' || next === '-' || next.endsWith('.')) {
            return;
          }
          onChange(round(toInches(parseMeasurement(next), unit)));
        }}
      />
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function FeatureControls({
  features,
  unit,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  features: EditorFeatures;
  unit: Unit;
  onChange: (patch: Partial<EditorFeatures>, options?: UndoableChangeOptions) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const unitLabel = unit;

  return (
    <>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={features.snapToGrid}
          onChange={(event) => onChange({ snapToGrid: event.target.checked })}
        />
        <span>Snap to grid</span>
      </label>
      <NumberField
        label={`Grid size (${unitLabel})`}
        valueIn={features.gridSizeIn}
        unit={unit}
        precision="size"
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(gridSizeIn) =>
          onChange({ gridSizeIn: Math.max(0.125, gridSizeIn) }, { undoable: false })
        }
      />
      <p className="muted feature-help">Snap settings apply while dragging or nudging pieces.</p>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={features.snapToAlignment}
          onChange={(event) => onChange({ snapToAlignment: event.target.checked })}
        />
        <span>Snap to alignment</span>
      </label>
      <NumberField
        label={`Alignment tolerance (${unitLabel})`}
        valueIn={features.alignmentToleranceIn}
        unit={unit}
        precision="size"
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(alignmentToleranceIn) =>
          onChange(
            { alignmentToleranceIn: Math.max(0.125, alignmentToleranceIn) },
            { undoable: false },
          )
        }
      />
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={features.wallEdgeBuffer}
          onChange={(event) => onChange({ wallEdgeBuffer: event.target.checked })}
        />
        <span>Wall edge buffer</span>
      </label>
      <NumberField
        label={`Wall edge buffer gap (${unitLabel})`}
        valueIn={features.wallEdgeBufferGapIn}
        unit={unit}
        precision="size"
        disabled={!features.wallEdgeBuffer}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(wallEdgeBufferGapIn) =>
          onChange(
            { wallEdgeBufferGapIn: Math.max(0.125, wallEdgeBufferGapIn) },
            { undoable: false },
          )
        }
      />
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={features.artPieceBuffer}
          onChange={(event) => onChange({ artPieceBuffer: event.target.checked })}
        />
        <span>Art piece buffer</span>
      </label>
      <NumberField
        label={`Art piece buffer gap (${unitLabel})`}
        valueIn={features.artPieceBufferGapIn}
        unit={unit}
        precision="size"
        disabled={!features.artPieceBuffer}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(artPieceBufferGapIn) =>
          onChange(
            { artPieceBufferGapIn: Math.max(0.125, artPieceBufferGapIn) },
            { undoable: false },
          )
        }
      />
      <p className="muted feature-help">
        Buffer guides reserve installation clearance around walls and artwork.
      </p>
    </>
  );
}

function FieldLabelWithInfo({
  htmlFor,
  label,
  info,
}: {
  htmlFor: string;
  label: string;
  info?: string;
}) {
  const tooltipId = useId();

  return (
    <span className="field-label-with-info">
      <label htmlFor={htmlFor}>{label}</label>
      {info ? (
        <span className="info-tip">
          <button
            type="button"
            className="info-button"
            aria-label={`${label} information`}
            aria-describedby={tooltipId}
          >
            <Info size={14} aria-hidden="true" />
          </button>
          <span className="info-tooltip" id={tooltipId} role="tooltip">
            {info}
          </span>
        </span>
      ) : null}
    </span>
  );
}

function AutoPlacementControls({
  settings,
  unit,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  settings: AutoPlacementSettings;
  unit: Unit;
  onChange: (settings: AutoPlacementSettings, options?: UndoableChangeOptions) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  function updateFeature(
    featureId: string,
    patch: Partial<WallFeature>,
    options?: UndoableChangeOptions,
  ) {
    onChange(
      {
        ...settings,
        wallFeatures: settings.wallFeatures.map((feature) =>
          feature.id === featureId ? { ...feature, ...patch } : feature,
        ),
      },
      options,
    );
  }

  function addFeature() {
    const index = settings.wallFeatures.length + 1;
    onChange({
      ...settings,
      wallFeatures: [
        ...settings.wallFeatures,
        {
          id: `feature-${Date.now()}-${index}`,
          type: 'sofa',
          name: `Wall feature ${index}`,
          xIn: 0,
          widthIn: 84,
          heightIn: 30,
        },
      ],
    });
  }

  function removeFeature(featureId: string) {
    onChange({
      ...settings,
      wallFeatures: settings.wallFeatures.filter((feature) => feature.id !== featureId),
    });
  }

  return (
    <>
      <label className="field">
        Wall setup
        <select
          value={settings.wallSetupMode}
          onChange={(event) =>
            onChange({
              ...settings,
              wallSetupMode: event.target.value as AutoPlacementSettings['wallSetupMode'],
            })
          }
        >
          <option value="available-sections">Available wall sections</option>
          <option value="full-wall-with-features">Full wall + furniture and features</option>
        </select>
      </label>
      <label className="field">
        Layout
        <select
          value={settings.layoutPreference}
          onChange={(event) =>
            onChange({
              ...settings,
              layoutPreference: event.target.value as AutoPlacementLayoutPreference,
            })
          }
        >
          <option value="auto">Auto</option>
          <option value="grid">Grid</option>
          <option value="row">Row</option>
          <option value="stack">Stack</option>
          <option value="salon">Salon</option>
        </select>
      </label>
      <div className="field">
        <FieldLabelWithInfo
          htmlFor="auto-placement-context"
          label="Context"
          info={
            settings.wallSetupMode === 'available-sections'
              ? 'Context sets placement priorities around your available wall sections. Choose a hallway for quick pass-by viewing, or a blank wall for a more relaxed display.'
              : undefined
          }
        />
        <select
          id="auto-placement-context"
          value={settings.context.kind}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'hallway') {
              onChange({ ...settings, context: { kind: 'hallway' } });
              return;
            }
            onChange({ ...settings, context: { kind: 'blank', viewingPosture: 'seated' } });
          }}
        >
          <option value="blank">Blank wall</option>
          <option value="hallway">Hallway</option>
        </select>
      </div>
      {settings.context.kind === 'blank' ? (
        <div className="field">
          <FieldLabelWithInfo
            htmlFor="auto-placement-viewing-height"
            label="Viewing height"
            info={
              settings.wallSetupMode === 'available-sections'
                ? 'Viewing height shifts the group vertically toward the height where people will usually see it. It does not change the dimensions of your wall sections.'
                : undefined
            }
          />
          <select
            id="auto-placement-viewing-height"
            value={settings.context.viewingPosture}
            onChange={(event) =>
              onChange({
                ...settings,
                context: {
                  kind: 'blank',
                  viewingPosture: event.target.value as 'seated' | 'standing',
                },
              })
            }
          >
            <option value="seated">Seated</option>
            <option value="standing">Standing</option>
          </select>
        </div>
      ) : null}
      {settings.wallSetupMode === 'full-wall-with-features' ? (
        <div className="section-list" aria-label="Furniture and wall features">
          <div className="panel-title compact">
            <h3>Furniture & Wall Features</h3>
          </div>
          {settings.wallFeatures.map((feature, index) => (
            <article className="setup-row" key={feature.id}>
              <div className="row-heading">
                <input
                  aria-label={`Feature ${index + 1} name`}
                  value={feature.name}
                  onFocus={onEditStart}
                  onBlur={onEditEnd}
                  onChange={(event) =>
                    updateFeature(feature.id, { name: event.target.value }, { undoable: false })
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove Feature ${index + 1}`}
                  onClick={() => removeFeature(feature.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <label className="field">
                {`Feature ${index + 1} type`}
                <select
                  value={feature.type}
                  onChange={(event) =>
                    updateFeature(feature.id, {
                      type: event.target.value as WallFeatureType,
                    })
                  }
                >
                  <option value="sofa">Sofa</option>
                  <option value="bed">Bed</option>
                  <option value="console">Console</option>
                  <option value="desk">Desk</option>
                  <option value="bookcase">Bookcase</option>
                  <option value="fireplace">Fireplace</option>
                  <option value="tv">TV</option>
                  <option value="window">Window</option>
                  <option value="door">Door</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <NumberField
                label={`Feature ${index + 1} left edge (${unit})`}
                valueIn={feature.xIn}
                unit={unit}
                onEditStart={onEditStart}
                onEditEnd={onEditEnd}
                onChange={(xIn) =>
                  updateFeature(feature.id, { xIn: Math.max(0, xIn) }, { undoable: false })
                }
              />
              <NumberField
                label={`Feature ${index + 1} width (${unit})`}
                valueIn={feature.widthIn}
                unit={unit}
                precision="size"
                onEditStart={onEditStart}
                onEditEnd={onEditEnd}
                onChange={(widthIn) =>
                  updateFeature(feature.id, { widthIn: Math.max(1, widthIn) }, { undoable: false })
                }
              />
              <NumberField
                label={`Feature ${index + 1} height (${unit})`}
                valueIn={feature.heightIn}
                unit={unit}
                precision="size"
                onEditStart={onEditStart}
                onEditEnd={onEditEnd}
                onChange={(heightIn) =>
                  updateFeature(
                    feature.id,
                    { heightIn: Math.max(0, heightIn) },
                    { undoable: false },
                  )
                }
              />
              <NumberField
                label={`Feature ${index + 1} clearance (${unit})`}
                valueIn={feature.clearanceOverrideIn ?? 6}
                unit={unit}
                precision="size"
                onEditStart={onEditStart}
                onEditEnd={onEditEnd}
                onChange={(clearanceOverrideIn) =>
                  updateFeature(
                    feature.id,
                    {
                      clearanceOverrideIn: Math.max(0, clearanceOverrideIn),
                    },
                    { undoable: false },
                  )
                }
              />
            </article>
          ))}
          <button type="button" className="secondary full-width" onClick={addFeature}>
            <Plus size={16} />
            Add furniture or feature
          </button>
        </div>
      ) : null}
    </>
  );
}

function HookControls({
  piece,
  unit,
  onChange,
  onEditStart,
  onEditEnd,
  onImmediateChange,
}: {
  piece: ArtPiece;
  unit: Unit;
  onChange: (hookSpec: HookSpec | undefined) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  onImmediateChange?: () => void;
}) {
  const count = piece.hookSpec?.count ?? 0;

  return (
    <div className="hook-controls">
      <label className="field">
        Hooks
        <select
          aria-label={`Hooks for ${piece.label}`}
          value={count}
          onChange={(event) => {
            onImmediateChange?.();
            const next = Number(event.target.value);
            if (next === 0) {
              onChange(undefined);
            } else if (next === 1) {
              onChange({ count: 1, topOffsetIn: 2, leftOffsetIn: piece.widthIn / 2 });
            } else {
              onChange({
                count: 2,
                leftTopOffsetIn: 2,
                leftSideOffsetIn: 3,
                rightTopOffsetIn: 2,
                rightSideOffsetIn: 3,
              });
            }
          }}
        >
          <option value={0}>None</option>
          <option value={1}>1 hook</option>
          <option value={2}>2 hooks</option>
        </select>
      </label>
      {piece.hookSpec?.count === 1 ? (
        <div className="field-grid">
          <NumberField
            label={`${piece.label} hook down from top`}
            valueIn={piece.hookSpec.topOffsetIn}
            unit={unit}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(topOffsetIn) => onChange({ ...piece.hookSpec!, topOffsetIn } as HookSpec)}
          />
          <NumberField
            label={`${piece.label} hook from left side`}
            valueIn={piece.hookSpec.leftOffsetIn}
            unit={unit}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(leftOffsetIn) => onChange({ ...piece.hookSpec!, leftOffsetIn } as HookSpec)}
          />
        </div>
      ) : null}
      {piece.hookSpec?.count === 2 ? (
        <div className="field-grid">
          <NumberField
            label={`${piece.label} left hook from left side`}
            valueIn={piece.hookSpec.leftSideOffsetIn}
            unit={unit}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(leftSideOffsetIn) =>
              onChange({ ...piece.hookSpec!, leftSideOffsetIn } as HookSpec)
            }
          />
          <NumberField
            label={`${piece.label} right hook from right side`}
            valueIn={piece.hookSpec.rightSideOffsetIn}
            unit={unit}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(rightSideOffsetIn) =>
              onChange({ ...piece.hookSpec!, rightSideOffsetIn } as HookSpec)
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function StagingTray({
  pieces,
  placements,
  selectedPieceId,
  unit,
  onSelect,
  onPointerDown,
}: {
  pieces: ArtPiece[];
  placements: Placement[];
  selectedPieceId: string;
  unit: Unit;
  onSelect: (pieceId: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, pieceId: string) => void;
}) {
  const stagedPieces = pieces.filter(
    (piece) => !placements.some((placement) => placement.pieceId === piece.id),
  );

  return (
    <section className="staging-tray" role="region" aria-label="Art staging tray">
      <div className="staging-header">
        <div className="panel-title">
          <PackageOpen size={18} />
          <h2>Staging tray</h2>
        </div>
        <p className="muted">Drag unused pieces onto the wall, or drag wall pieces back here.</p>
      </div>
      {stagedPieces.length > 0 ? (
        <div className="staged-piece-list">
          {stagedPieces.map((piece) => (
            <button
              type="button"
              key={piece.id}
              className={`staged-piece ${piece.id === selectedPieceId ? 'selected' : ''}`}
              aria-label={`Drag ${piece.label} from staging`}
              onClick={() => onSelect(piece.id)}
              onPointerDown={(event) => onPointerDown(event, piece.id)}
            >
              <span
                className="staged-piece-preview"
                data-testid="staged-piece-preview"
                style={{
                  width: `${piece.widthIn * STAGING_SCALE_PX_PER_IN}px`,
                  height: `${piece.heightIn * STAGING_SCALE_PX_PER_IN}px`,
                }}
                aria-hidden="true"
              />
              <span className="staged-piece-caption">
                <span className="staged-piece-name">{piece.label}</span>
                <small className="staged-piece-size">
                  {formatMeasurement(piece.widthIn, unit)} x{' '}
                  {formatMeasurement(piece.heightIn, unit)}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-tray">All pieces are currently on the wall.</p>
      )}
    </section>
  );
}

function WallCanvas({
  svgRef,
  sections,
  pieces,
  placements,
  selectedPieceId,
  selectedSectionId,
  autoPlacementSettings,
  features,
  unit,
  viewBox,
  onSectionPointerDown,
  onSectionMouseDown,
  onSectionKeyDown,
  onPointerDownCapture,
  onPanPointerDown,
  onPanPointerMove,
  onPanMouseDown,
  onPanMouseMove,
  onPointerDown,
  onPieceKeyDown,
  onPointerMove,
  onPointerUp,
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  selectedPieceId: string;
  selectedSectionId: string;
  autoPlacementSettings: AutoPlacementSettings;
  features: EditorFeatures;
  unit: Unit;
  viewBox: WallViewBox;
  onSectionPointerDown: (event: React.PointerEvent<SVGRectElement>, section: WallSection) => void;
  onSectionMouseDown: (event: React.MouseEvent<SVGRectElement>, section: WallSection) => void;
  onSectionKeyDown: (event: React.KeyboardEvent<SVGRectElement>, section: WallSection) => void;
  onPointerDownCapture: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPanPointerDown: (event: React.PointerEvent<SVGRectElement>) => void;
  onPanPointerMove: (event: React.PointerEvent<SVGRectElement>) => void;
  onPanMouseDown: (event: React.MouseEvent<SVGRectElement>) => void;
  onPanMouseMove: (event: React.MouseEvent<SVGRectElement>) => void;
  onPointerDown: (event: React.PointerEvent<SVGRectElement>, placement: Placement) => void;
  onPieceKeyDown: (event: React.KeyboardEvent<SVGRectElement>, placement: Placement) => void;
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
}) {
  const layout = useMemo(() => getWallLayout(sections), [sections]);
  const sectionOffsets = useMemo(
    () =>
      new Map(
        layout.map(({ section, offsetXIn, offsetYIn }) => [section.id, { offsetXIn, offsetYIn }]),
      ),
    [layout],
  );
  const piecesById = useMemo(() => new Map(pieces.map((piece) => [piece.id, piece])), [pieces]);
  const exteriorEdges = useMemo(() => getWallExteriorEdges(sections), [sections]);
  const featureBlocks = useMemo(() => {
    if (autoPlacementSettings.wallSetupMode !== 'full-wall-with-features') {
      return [];
    }
    const bounds = getWallBounds(sections);
    return autoPlacementSettings.wallFeatures.map((feature) => {
      const rule = resolveWallFeatureRule(feature);
      const top = bounds.maxY - feature.heightIn - rule.clearanceIn;
      return {
        id: feature.id,
        label: feature.name,
        left: feature.xIn,
        top,
        width: feature.widthIn,
        height: bounds.maxY - top,
      };
    });
  }, [autoPlacementSettings, sections]);
  const gridSize = features.snapToGrid ? Math.max(0.125, features.gridSizeIn) : 6;
  const wallEdgeBufferPaths = useMemo(
    () =>
      features.wallEdgeBuffer
        ? getInsetWallExteriorPaths(sections, features.wallEdgeBufferGapIn)
        : [],
    [features.wallEdgeBuffer, features.wallEdgeBufferGapIn, sections],
  );

  return (
    <svg
      ref={svgRef}
      className="wall-canvas"
      role="img"
      aria-label="Scaled gallery wall layout"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <pattern id="minor-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            fill="none"
            stroke="var(--grid-line)"
            strokeWidth="0.18"
          />
        </pattern>
      </defs>
      <rect
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.width}
        height={viewBox.height}
        fill="url(#minor-grid)"
        className="wall-pan-surface"
        onPointerDown={onPanPointerDown}
        onPointerMove={onPanPointerMove}
        onMouseDown={onPanMouseDown}
        onMouseMove={onPanMouseMove}
      />
      {layout.map(({ section, offsetXIn, offsetYIn }) => (
        <g key={section.id}>
          <rect
            x={offsetXIn}
            y={offsetYIn}
            width={section.widthIn}
            height={section.heightIn}
            className={section.id === selectedSectionId ? 'wall-section selected' : 'wall-section'}
            role="button"
            tabIndex={0}
            aria-pressed={section.id === selectedSectionId}
            aria-label={`Move ${section.name}`}
            onPointerDown={(event) => onSectionPointerDown(event, section)}
            onMouseDown={(event) => onSectionMouseDown(event, section)}
            onKeyDown={(event) => onSectionKeyDown(event, section)}
          />
          <text x={offsetXIn + 2} y={offsetYIn - 2} className="section-label">
            {section.name} - {formatMeasurement(section.widthIn, unit)} x{' '}
            {formatMeasurement(section.heightIn, unit)}
          </text>
        </g>
      ))}
      {exteriorEdges.map((edge, index) => (
        <line
          key={`wall-exterior-edge-${index}-${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`}
          x1={edge.x1}
          y1={edge.y1}
          x2={edge.x2}
          y2={edge.y2}
          className="wall-exterior-edge"
        />
      ))}
      {wallEdgeBufferPaths.map((path, index) => (
        <path
          key={`wall-edge-buffer-${index}`}
          d={toClosedSvgPath(path.points)}
          className="wall-edge-buffer-guide"
          strokeDasharray="1.5 1"
          strokeWidth="0.25"
        />
      ))}
      {featureBlocks.map((block) => (
        <rect
          key={block.id}
          x={block.left}
          y={block.top}
          width={block.width}
          height={block.height}
          className="wall-feature-block"
          aria-label={`${block.label} blocked area`}
        />
      ))}
      {placements.map((placement) => {
        const piece = piecesById.get(placement.pieceId);
        if (!piece) {
          return null;
        }
        const offset = sectionOffsets.get(placement.sectionId) ?? { offsetXIn: 0, offsetYIn: 0 };
        const offsetX = offset.offsetXIn;
        const offsetY = offset.offsetYIn;
        const selected = piece.id === selectedPieceId;
        const pieceX = offsetX + placement.xIn;
        const pieceY = offsetY + placement.yIn;
        return (
          <g key={piece.id} className={selected ? 'piece selected' : 'piece'}>
            <rect
              x={pieceX}
              y={pieceY}
              width={piece.widthIn}
              height={piece.heightIn}
              rx="0.8"
              focusable="false"
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Move ${piece.label}`}
              onPointerDown={(event) => onPointerDown(event, placement)}
              onKeyDown={(event) => onPieceKeyDown(event, placement)}
            />
            <PieceLabelSvg piece={piece} offsetX={pieceX} offsetY={pieceY} clipId={piece.id} />
            {piece.hookSpec ? <HookMarks piece={piece} offsetX={pieceX} offsetY={pieceY} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

function toClosedSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }

  return `M ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')} Z`;
}

function PieceLabelSvg({
  piece,
  offsetX,
  offsetY,
  clipId,
}: {
  piece: ArtPiece;
  offsetX: number;
  offsetY: number;
  clipId: string;
}) {
  const label = fitPieceLabel(piece.label, piece.widthIn, piece.heightIn);
  const labelLineHeight = label.fontSize * LABEL_LINE_HEIGHT_RATIO;
  const labelCenterY =
    label.placement === 'inside'
      ? offsetY + piece.heightIn / 2 - ((label.lines.length - 1) * labelLineHeight) / 2
      : offsetY + piece.heightIn + labelLineHeight;
  const labelCenterX = offsetX + piece.widthIn / 2;
  const resolvedClipId = `piece-label-clip-${clipId}`;

  return (
    <>
      {label.placement === 'inside' ? (
        <clipPath id={resolvedClipId}>
          <rect
            x={offsetX + label.padding}
            y={offsetY + label.padding}
            width={Math.max(0.1, piece.widthIn - label.padding * 2)}
            height={Math.max(0.1, piece.heightIn - label.padding * 2)}
          />
        </clipPath>
      ) : null}
      <text
        x={labelCenterX}
        y={labelCenterY}
        textAnchor="middle"
        dominantBaseline="middle"
        className={label.placement === 'inside' ? 'piece-label' : 'piece-label outside-piece-label'}
        clipPath={label.placement === 'inside' ? `url(#${resolvedClipId})` : undefined}
        style={{ fontSize: `${label.fontSize}px` }}
      >
        {label.lines.map((line, index) => (
          <tspan
            key={`${clipId}-label-${index}`}
            x={labelCenterX}
            dy={index === 0 ? 0 : labelLineHeight}
          >
            {line}
          </tspan>
        ))}
      </text>
    </>
  );
}

const LABEL_LINE_HEIGHT_RATIO = 1.15;
const LABEL_WIDTH_RATIO = 0.62;

function fitPieceLabel(label: string, widthIn: number, heightIn: number) {
  const padding = Math.min(1.25, Math.max(0.5, Math.min(widthIn, heightIn) * 0.1));
  const availableWidth = Math.max(0.5, widthIn - padding * 2);
  const availableHeight = Math.max(0.5, heightIn - padding * 2);
  const text = label.trim().replace(/\s+/g, ' ') || 'Untitled';
  const fontSizes = [3, 2.5, 2, 1.6];
  const minimumInsideFontSize = 1.6;

  for (const fontSize of fontSizes) {
    const lines = wrapLabelLines(text, availableWidth, fontSize);
    const lineHeight = fontSize * LABEL_LINE_HEIGHT_RATIO;
    if (
      fontSize >= minimumInsideFontSize &&
      lines.length * lineHeight <= availableHeight &&
      lines.every((line) => labelLineFits(line, availableWidth, fontSize))
    ) {
      return { lines, fontSize, padding, placement: 'inside' as const };
    }
  }

  return { lines: [text], fontSize: 1.6, padding, placement: 'outside' as const };
}

function wrapLabelLines(label: string, availableWidth: number, fontSize: number): string[] {
  const maxCharacters = Math.max(1, Math.floor(availableWidth / (fontSize * LABEL_WIDTH_RATIO)));
  const lines: string[] = [];

  for (const word of label.split(' ')) {
    const current = lines.at(-1);
    if (!current) {
      lines.push(word);
    } else if (`${current} ${word}`.length <= maxCharacters) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else {
      lines.push(word);
    }
  }

  return lines;
}

function labelLineFits(line: string, availableWidth: number, fontSize: number): boolean {
  return line.length * fontSize * LABEL_WIDTH_RATIO <= availableWidth;
}

function HookMarks({
  piece,
  offsetX,
  offsetY,
}: {
  piece: ArtPiece;
  offsetX: number;
  offsetY: number;
}) {
  const hooks =
    piece.hookSpec?.count === 1
      ? [{ xIn: piece.hookSpec.leftOffsetIn, yIn: piece.hookSpec.topOffsetIn }]
      : piece.hookSpec?.count === 2
        ? [
            { xIn: piece.hookSpec.leftSideOffsetIn, yIn: piece.hookSpec.leftTopOffsetIn },
            {
              xIn: piece.widthIn - piece.hookSpec.rightSideOffsetIn,
              yIn: piece.hookSpec.rightTopOffsetIn,
            },
          ]
        : [];

  return hooks.map((hook, index) => (
    <circle
      key={`${piece.id}-hook-${index}`}
      cx={offsetX + hook.xIn}
      cy={offsetY + hook.yIn}
      r="1.2"
      className="hook-mark"
    />
  ));
}

function ExportPanel({
  ready,
  issues,
  onExportPng,
  onExportPdf,
  onExportJson,
  onImportClick,
}: {
  ready: boolean;
  issues: string[];
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onImportClick: () => void;
}) {
  const printExportRequirement = ready
    ? 'Export the print layout.'
    : `Complete export requirements: ${issues.join(' ')}`;

  return (
    <CollapsiblePanel icon={<Download size={18} />} title="Export" ariaLabel="Export settings">
      <div className="export-section">
        <h3>Print/export layout</h3>
        <p className="muted">
          PNG and PDF exports include the visual layout, piece table, and installation measurements.
        </p>
        {issues.length > 0 ? (
          <ul className="issue-list" role="alert" aria-live="assertive">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        <div className="export-actions">
          <button
            type="button"
            className="secondary"
            disabled={!ready}
            title={printExportRequirement}
            onClick={onExportPng}
          >
            <FileImage size={18} />
            Export PNG
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!ready}
            title={printExportRequirement}
            onClick={onExportPdf}
          >
            <FileText size={18} />
            Export PDF
          </button>
        </div>
      </div>
      <div className="export-section">
        <h3>Save/load design</h3>
        <p className="muted">
          JSON is the editable project file for reopening this design and continuing later.
        </p>
        <div className="export-actions">
          <button type="button" className="secondary" onClick={onExportJson}>
            <FileJson size={18} />
            Export JSON
          </button>
          <button type="button" className="secondary" onClick={onImportClick}>
            <Upload size={18} />
            Import JSON
          </button>
        </div>
      </div>
      <div className="scale-note">
        <Download size={16} />
        Print exports are for installation; JSON files are for editing this design later.
      </div>
      <p className="muted persistence-note">
        Your current design is saved locally in this browser.
      </p>
    </CollapsiblePanel>
  );
}

function MeasurementsTable({
  instructions,
}: {
  instructions: ReturnType<typeof buildMeasurementInstructions>;
}) {
  return (
    <CollapsiblePanel
      icon={<Ruler size={18} />}
      title="Installation measurements"
      ariaLabel="Installation measurements"
      className="measurements-panel"
    >
      <table className="measurements-table" aria-label="Installation measurements">
        <thead>
          <tr>
            <th>Order</th>
            <th>Piece</th>
            <th>Section</th>
            <th>Top reference</th>
            <th>Side reference</th>
            <th>Hooks</th>
          </tr>
        </thead>
        <tbody>
          {instructions.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-measurements">
                Place a piece on the wall to see installation measurements.
              </td>
            </tr>
          ) : (
            instructions.map((instruction) => (
              <tr key={instruction.pieceId}>
                <td>{instruction.order}</td>
                <td>{instruction.pieceLabel}</td>
                <td>{instruction.sectionName}</td>
                <td>
                  {instruction.topReference.formatted} from {instruction.topReference.label}
                </td>
                <td>
                  {instruction.sideReference.formatted} from {instruction.sideReference.label}
                </td>
                <td>
                  {instruction.hooks.length === 0
                    ? 'No hook data'
                    : instruction.hooks
                        .map(
                          (hook) =>
                            `${hook.label}: ${hook.formattedY} down, ${hook.formattedX} from ${hook.reference}`,
                        )
                        .join('; ')}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {instructions.length > 0 ? (
        <div className="measurement-cards" aria-label="Installation measurements">
          {instructions.map((instruction) => (
            <article className="measurement-card" key={instruction.pieceId}>
              <h3>
                {instruction.order}. {instruction.pieceLabel}
              </h3>
              <p className="muted">{instruction.sectionName}</p>
              <dl>
                <div>
                  <dt>Top</dt>
                  <dd>
                    {instruction.topReference.formatted} from {instruction.topReference.label}
                  </dd>
                </div>
                <div>
                  <dt>Side</dt>
                  <dd>
                    {instruction.sideReference.formatted} from {instruction.sideReference.label}
                  </dd>
                </div>
                <div>
                  <dt>Hooks</dt>
                  <dd>
                    {instruction.hooks.length === 0
                      ? 'No hook data'
                      : instruction.hooks
                          .map(
                            (hook) =>
                              `${hook.label}: ${hook.formattedY} down, ${hook.formattedX} from ${hook.reference}`,
                          )
                          .join('; ')}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </CollapsiblePanel>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isHookSpec(value: unknown): value is HookSpec | undefined {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value) || (value.count !== 1 && value.count !== 2)) {
    return false;
  }
  return value.count === 1
    ? isFiniteNumber(value.topOffsetIn) && isFiniteNumber(value.leftOffsetIn)
    : isFiniteNumber(value.leftTopOffsetIn) &&
        isFiniteNumber(value.leftSideOffsetIn) &&
        isFiniteNumber(value.rightTopOffsetIn) &&
        isFiniteNumber(value.rightSideOffsetIn);
}

function isEditorFeatures(value: unknown): value is EditorFeatures {
  return (
    isRecord(value) &&
    typeof value.snapToGrid === 'boolean' &&
    isFiniteNumber(value.gridSizeIn) &&
    typeof value.snapToAlignment === 'boolean' &&
    isFiniteNumber(value.alignmentToleranceIn) &&
    typeof value.wallEdgeBuffer === 'boolean' &&
    isFiniteNumber(value.wallEdgeBufferGapIn) &&
    typeof value.artPieceBuffer === 'boolean' &&
    isFiniteNumber(value.artPieceBufferGapIn)
  );
}

function isAutoPlacementSettings(value: unknown): value is AutoPlacementSettings {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.wallSetupMode !== 'available-sections' &&
    value.wallSetupMode !== 'full-wall-with-features'
  ) {
    return false;
  }
  if (!Array.isArray(value.wallFeatures) || !value.wallFeatures.every(isWallFeature)) {
    return false;
  }
  const layoutPreference = value.layoutPreference;
  if (
    layoutPreference !== 'auto' &&
    layoutPreference !== 'grid' &&
    layoutPreference !== 'row' &&
    layoutPreference !== 'stack' &&
    layoutPreference !== 'salon'
  ) {
    return false;
  }

  const context = value.context;
  if (!isRecord(context)) {
    return false;
  }
  if (context.kind === 'hallway') {
    return true;
  }
  if (context.kind === 'blank') {
    return context.viewingPosture === 'seated' || context.viewingPosture === 'standing';
  }
  return false;
}

function isWallFeature(value: unknown): value is WallFeature {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isWallFeatureType(value.type) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.xIn) &&
    isFiniteNumber(value.widthIn) &&
    isFiniteNumber(value.heightIn) &&
    (value.clearanceOverrideIn === undefined || isFiniteNumber(value.clearanceOverrideIn))
  );
}

function isWallFeatureType(value: unknown): value is WallFeatureType {
  return (
    value === 'sofa' ||
    value === 'bed' ||
    value === 'console' ||
    value === 'desk' ||
    value === 'bookcase' ||
    value === 'fireplace' ||
    value === 'tv' ||
    value === 'window' ||
    value === 'door' ||
    value === 'custom'
  );
}

function isPersistedGalleryState(value: unknown): value is Partial<GalleryState> {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !Array.isArray(value.sections) ||
    !Array.isArray(value.pieces) ||
    !Array.isArray(value.placements)
  ) {
    return false;
  }
  if (
    !value.sections.every(
      (section) =>
        isRecord(section) &&
        typeof section.id === 'string' &&
        typeof section.name === 'string' &&
        isFiniteNumber(section.widthIn) &&
        isFiniteNumber(section.heightIn) &&
        (section.cornerAfter === 'none' ||
          section.cornerAfter === 'left' ||
          section.cornerAfter === 'right') &&
        (section.xIn === undefined || isFiniteNumber(section.xIn)) &&
        (section.yIn === undefined || isFiniteNumber(section.yIn)),
    )
  ) {
    return false;
  }
  if (
    !value.pieces.every(
      (piece) =>
        isRecord(piece) &&
        typeof piece.id === 'string' &&
        typeof piece.label === 'string' &&
        isFiniteNumber(piece.widthIn) &&
        isFiniteNumber(piece.heightIn) &&
        isHookSpec(piece.hookSpec),
    )
  ) {
    return false;
  }
  return value.placements.every(
    (placement) =>
      isRecord(placement) &&
      typeof placement.pieceId === 'string' &&
      typeof placement.sectionId === 'string' &&
      isFiniteNumber(placement.xIn) &&
      isFiniteNumber(placement.yIn),
  );
}

function loadState(): GalleryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedGalleryState(parsed)) {
      return defaultState;
    }
    return {
      ...defaultState,
      ...parsed,
      themeMode:
        parsed.themeMode === 'light' || parsed.themeMode === 'dark' || parsed.themeMode === 'system'
          ? parsed.themeMode
          : defaultState.themeMode,
      applicationTheme: resolveApplicationTheme(parsed.applicationTheme),
      sections: normalizeWallSections(parsed.sections ?? defaultState.sections),
      unit: parsed.unit === 'cm' ? 'cm' : 'in',
      features: isEditorFeatures(parsed.features) ? parsed.features : defaultState.features,
      autoPlacementSettings: isAutoPlacementSettings(parsed.autoPlacementSettings)
        ? parsed.autoPlacementSettings
        : defaultState.autoPlacementSettings,
      message: defaultState.message,
    };
  } catch {
    return defaultState;
  }
}
