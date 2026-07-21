import {
  ChevronDown,
  Copy,
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
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { autoPlacePieces, type AutoPlacementDiagnostics } from './lib/autoPlace';
import {
  applicationThemeOptions,
  type ApplicationTheme,
  resolveApplicationTheme,
} from './lib/applicationTheme';
import { parseDesignFile, serializeDesignFile } from './lib/designFile';
import { downloadPdf, downloadPng, type ExportDesignInput } from './lib/exportDesign';
import { buildMeasurementInstructions } from './lib/measurements';
import { buildMeasurementTableRows, MEASUREMENT_TABLE_HEADERS } from './lib/measurementTable';
import {
  getGroupBounds,
  getPieceIdsIntersectingRect,
  normalizeSelectionRect,
  translatePlacementGroup,
} from './lib/multiSelection';
import {
  getPlacementIssues,
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
import {
  avoidTooltipCollisions,
  calculateTooltipPosition,
  type TooltipPosition,
} from './lib/tooltipPosition';
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
import { movePlacedFeaturesWithWallSection, resolveWallFeatureRule } from './lib/wallFeatures';
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
const MAX_STAGED_ART_PREVIEW_HEIGHT_PX = 96;
const DRAG_PREVIEW_SCALE_PX_PER_IN = 3;
const SUPPRESS_TEXT_SELECTION_CLASS = 'suppress-text-selection';
const DEFAULT_WALL_PADDING_IN = 14;
const DEFAULT_WALL_LABEL_GAP_IN = 10;
const MIN_WALL_ZOOM = 0.5;
const MAX_WALL_ZOOM = 4;
const ZOOM_BUTTON_FACTOR = 1.2;
const WALL_MOUSE_PAN_ID = -2;
const POINTER_DRAG_THRESHOLD_PX = 4;

interface GalleryState {
  unit: Unit;
  themeMode: ThemeMode;
  applicationTheme: ApplicationTheme;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  autoPlacementSettings: AutoPlacementSettings;
  selectedPieceIds: string[];
  message: string;
}

interface VisibleAlignmentGuides {
  guides: AlignmentGuide[];
  isLingering: boolean;
}

interface UndoableChangeOptions {
  undoable?: boolean;
}

type DragItemKind = 'piece' | 'feature';

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

interface WallDragPreview {
  itemId: string;
  itemKind: DragItemKind;
  label: string;
  widthIn: number;
  heightIn: number;
  clientX: number;
  clientY: number;
  widthPx: number;
  heightPx: number;
  itemCount: number;
  pieces?: DragPreviewPiece[];
}

interface DragPreviewPiece {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  xIn: number;
  yIn: number;
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
    showAlignmentGuides: true,
    alignmentToleranceIn: 1,
    wallEdgeBuffer: false,
    wallEdgeBufferGapIn: 2,
    artPieceBuffer: false,
    artPieceBufferGapIn: 2,
    measurementReferenceMode: 'relative',
  },
  autoPlacementSettings: {
    wallSetupMode: 'available-sections',
    context: { kind: 'blank', viewingPosture: 'seated' },
    layoutPreference: 'auto',
    wallFeatures: [],
  },
  selectedPieceIds: ['piece-1'],
  message: 'Enter wall and art dimensions, then place pieces on the scaled wall.',
};

export default function App() {
  const [state, setState] = useState<GalleryState>(() => loadState());
  const [autoPlacementFailure, setAutoPlacementFailure] = useState<{
    message: string;
    diagnostics: AutoPlacementDiagnostics;
  } | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [wallDragPreview, setWallDragPreview] = useState<WallDragPreview | null>(null);
  const [groupDragPreview, setGroupDragPreview] = useState<Placement[]>([]);
  const [selectionMarquee, setSelectionMarquee] = useState<Rect | null>(null);
  const [visibleAlignmentGuides, setVisibleAlignmentGuides] = useState<VisibleAlignmentGuides>({
    guides: [],
    isLingering: false,
  });
  const [undoState, setUndoState] = useState<GalleryState | null>(null);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const [advancedDrawerOpen, setAdvancedDrawerOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState(defaultState.sections[0]?.id ?? '');
  const [expandedPieceId, setExpandedPieceId] = useState(defaultState.pieces[0]?.id ?? '');
  const [autoPlacementVariantIndex, setAutoPlacementVariantIndex] = useState(0);
  const [cursorInteraction, setCursorInteraction] = useState<CursorInteraction>('idle');
  const [wallZoom, setWallZoom] = useState<WallZoomState>(() =>
    getDefaultWallZoomState(getWallCanvasBaseViewBox(defaultState.sections)),
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
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
  const marqueeRef = useRef<MarqueeState | null>(null);
  const spacePressedRef = useRef(false);
  const alignmentGuideTimeoutRef = useRef<number | null>(null);
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

  const wallIssues = useMemo(() => validateWallSections(state.sections), [state.sections]);
  const wallBaseViewBox = useMemo(() => getWallCanvasBaseViewBox(state.sections), [state.sections]);
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
  const activeSelectedPieceId = state.selectedPieceIds.at(-1) ?? '';
  const selectedPiece = state.pieces.find((piece) => piece.id === activeSelectedPieceId);
  const selectedPlacement = state.placements.find(
    (placement) => placement.pieceId === activeSelectedPieceId,
  );
  const selectedFeature = state.autoPlacementSettings.wallFeatures.find(
    (feature) => feature.id === selectedFeatureId && isPlacedWallFeature(feature),
  );
  const readyToExport = allIssues.length === 0 && state.pieces.length > 0;

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

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => () => clearAlignmentGuideTimeout(), []);

  useEffect(() => {
    if (!state.features.showAlignmentGuides) {
      clearAlignmentGuideTimeout();
      setVisibleAlignmentGuides({ guides: [], isLingering: false });
    }
  }, [state.features.showAlignmentGuides]);

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
      const wantsPan =
        event.pointerType === 'touch'
          ? wallZoomRef.current.scale > 1
          : event.button === 1 || spacePressedRef.current;
      if (
        !wantsPan ||
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
      const wantsPan = event.button === 1 || spacePressedRef.current;
      if (
        !wantsPan ||
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
    setSelectedFeatureId('');
    setExpandedPieceId(pieceId);
    setState((current) => ({ ...current, selectedPieceIds: [pieceId] }));
  }

  function togglePieceSelection(pieceId: string) {
    setSelectedFeatureId('');
    setState((current) => {
      const selected = current.selectedPieceIds.includes(pieceId);
      const nextSelectedPieceIds = selected
        ? current.selectedPieceIds.filter((candidate) => candidate !== pieceId)
        : [...current.selectedPieceIds, pieceId];
      setExpandedPieceId(nextSelectedPieceIds.at(-1) ?? '');
      return {
        ...current,
        selectedPieceIds: nextSelectedPieceIds,
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
    setSelectedFeatureId(featureId);
    setState((current) => ({ ...current, selectedPieceIds: [] }));
  }

  function toggleFeatureSelection(featureId: string) {
    setSelectedFeatureId((current) => (current === featureId ? '' : featureId));
    setState((current) => ({ ...current, selectedPieceIds: [] }));
  }

  function selectSection(sectionId: string) {
    setSelectedFeatureId('');
    setSelectedSectionId(sectionId);
    setExpandedSectionId(sectionId);
  }

  function toggleSectionSelection(sectionId: string) {
    setSelectedFeatureId('');
    setSelectedSectionId((current) => {
      const next = current === sectionId ? '' : sectionId;
      setExpandedSectionId(next);
      return next;
    });
  }

  function clearSelection() {
    setSelectedSectionId('');
    setSelectedFeatureId('');
    setExpandedSectionId('');
    setExpandedPieceId('');
    setState((current) => ({ ...current, selectedPieceIds: [] }));
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

  function updateUnit(unit: Unit) {
    recordUndoSnapshot();
    setState((current) => ({ ...current, unit }));
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
    setState((current) => {
      const index = current.sections.length + 1;
      const normalizedSections = normalizeWallSections(current.sections);
      const previousSection = normalizedSections.at(-1);
      const sectionId = `section-${index}`;
      setExpandedSectionId(sectionId);
      setSelectedSectionId(sectionId);
      return {
        ...current,
        sections: [
          ...normalizedSections,
          {
            id: sectionId,
            name: `Section ${index}`,
            widthIn: previousSection?.widthIn ?? 96,
            heightIn: previousSection?.heightIn ?? 84,
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
    setSelectedFeatureId('');
    setState((current) => {
      const index = current.pieces.length + 1;
      const piece = {
        id: `piece-${Date.now()}-${index}`,
        label: `Piece ${index}`,
        widthIn: 16,
        heightIn: 20,
      };
      setExpandedPieceId(piece.id);
      return {
        ...current,
        pieces: [...current.pieces, piece],
        selectedPieceIds: [piece.id],
      };
    });
  }

  function duplicatePiece(pieceId: string) {
    recordUndoSnapshot();
    setSelectedFeatureId('');
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
      setExpandedPieceId(duplicate.id);
      return {
        ...current,
        pieces: [...current.pieces, duplicate],
        selectedPieceIds: [duplicate.id],
        message: `Duplicated ${source.label}.`,
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
    setSelectedFeatureId('');
    setState((current) => {
      const nextPieces = current.pieces.filter((piece) => piece.id !== pieceId);
      return {
        ...current,
        pieces: nextPieces,
        placements: current.placements.filter((placement) => placement.pieceId !== pieceId),
        selectedPieceIds: current.selectedPieceIds.filter((candidate) => candidate !== pieceId),
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

  function clearAlignmentGuideTimeout() {
    if (alignmentGuideTimeoutRef.current !== null) {
      window.clearTimeout(alignmentGuideTimeoutRef.current);
      alignmentGuideTimeoutRef.current = null;
    }
  }

  function showAlignmentGuides(guides: AlignmentGuide[]) {
    clearAlignmentGuideTimeout();
    setVisibleAlignmentGuides({
      guides: guides.slice(0, 2),
      isLingering: false,
    });
  }

  function lingerAlignmentGuides() {
    clearAlignmentGuideTimeout();
    setVisibleAlignmentGuides((current) => {
      if (current.guides.length === 0) {
        return current;
      }
      return { ...current, isLingering: true };
    });
    alignmentGuideTimeoutRef.current = window.setTimeout(() => {
      alignmentGuideTimeoutRef.current = null;
      setVisibleAlignmentGuides({ guides: [], isLingering: false });
    }, 1000);
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
    setSelectedFeatureId('');
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
        selectedPieceIds: [placement.pieceId],
        placements: [
          ...current.placements.filter((candidate) => candidate.pieceId !== placement.pieceId),
          placement,
        ],
        message:
          piece && placementSection
            ? `Placed ${piece.label} on ${placementSection.name}.`
            : 'Placed a piece on the wall.',
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
      selectedPieceIds: pieceIds,
      placements: [
        ...current.placements.filter((placement) => !movingIds.has(placement.pieceId)),
        ...proposedPlacements,
      ],
      message:
        proposedPlacements.length === 1
          ? `Moved ${getPieceLabel(current, proposedPlacements[0].pieceId)} on the wall.`
          : `Moved ${proposedPlacements.length} art pieces as a group.`,
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
      setSelectedFeatureId('');
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
        selectedPieceIds: [proposedPlacement.pieceId],
        placements: [
          ...current.placements.filter(
            (candidate) => candidate.pieceId !== proposedPlacement.pieceId,
          ),
          proposedPlacement,
        ],
        message: `Moved ${getPieceLabel(current, proposedPlacement.pieceId)} on the wall.`,
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
        return current;
      }
      const placedFeature = {
        ...applyFeatureFeatures(current, { ...feature, ...proposedFeature, placed: true }),
        placed: true,
      };
      return {
        ...current,
        selectedPieceIds: [],
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: current.autoPlacementSettings.wallFeatures.map((candidate) =>
            candidate.id === placedFeature.id ? placedFeature : candidate,
          ),
        },
        message: `Placed ${placedFeature.name} on the wall.`,
      };
    });
    setSelectedFeatureId(proposedFeature.id);
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
        return current;
      }
      const placedFeature = { ...feature, ...proposedFeature, placed: true };
      return {
        ...current,
        selectedPieceIds: [],
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: current.autoPlacementSettings.wallFeatures.map((candidate) =>
            candidate.id === placedFeature.id ? placedFeature : candidate,
          ),
        },
        message: `Moved ${placedFeature.name} on the wall.`,
      };
    });
    setSelectedFeatureId(proposedFeature.id);
    if (guides.length > 0) {
      showAlignmentGuides(guides);
    } else {
      showAlignmentGuides([]);
    }
    lingerAlignmentGuides();
  }

  function clearPlacedArt() {
    recordUndoSnapshot();
    setSelectedFeatureId('');
    setState((current) => ({
      ...current,
      placements: [],
      selectedPieceIds: current.pieces[0] ? [current.pieces[0].id] : [],
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
    setSelectedFeatureId('');
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
      selectedPieceIds: [],
      message: 'Reset the entire design. Add wall sections and art pieces to start over.',
    });
    setWallZoom(getDefaultWallZoomState(getWallCanvasBaseViewBox([])));
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
    setSelectedFeatureId('');
    setState((current) => ({
      ...current,
      selectedPieceIds: [pieceId],
      placements: current.placements.filter((placement) => placement.pieceId !== pieceId),
      message: `Returned ${getPieceLabel(current, pieceId)} to the staging tray.`,
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
      selectedPieceIds: pieceIds,
      placements: current.placements.filter((placement) => !movingIds.has(placement.pieceId)),
      message:
        pieceIds.length === 1
          ? `Returned ${getPieceLabel(current, pieceIds[0])} to the staging tray.`
          : `Returned ${pieceIds.length} art pieces to the staging tray.`,
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
        selectedPieceIds: [],
        autoPlacementSettings: {
          ...current.autoPlacementSettings,
          wallFeatures: current.autoPlacementSettings.wallFeatures.map((candidate) =>
            candidate.id === featureId ? { ...candidate, placed: false } : candidate,
          ),
        },
        message: feature
          ? `Returned ${feature.name} to the staging tray.`
          : 'Returned furniture or feature to the staging tray.',
      };
    });
    setSelectedFeatureId(featureId);
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
      initialPieceIds: state.selectedPieceIds,
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
      setState((current) => ({ ...current, message: result.message }));
      return;
    }

    setAutoPlacementFailure(null);
    const resolvedVariantIndex = result.variantCount > 0 ? variantIndex % result.variantCount : 0;
    setAutoPlacementVariantIndex(resolvedVariantIndex);
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
    setSelectedFeatureId('');
    setState((current) => ({
      ...current,
      placements: result.placements,
      selectedPieceIds: firstNewPlacement ? [firstNewPlacement.pieceId] : current.selectedPieceIds,
      message:
        result.preservedPlacementCount > 0
          ? `Auto-placement placed ${formatCount(result.newPlacementCount, 'remaining piece')} around ${formatCount(result.preservedPlacementCount, 'piece')} you positioned. Existing pieces were not moved.`
          : mode === 'shuffle'
            ? `Shuffled to layout ${resolvedVariantIndex + 1} of ${result.variantCount}.`
            : (result.explanation ?? `Auto-placement created a ${result.layoutKind} layout.`),
    }));
  }

  function handleAutoPlace() {
    runAutoPlacement(0, 'place');
  }

  function handleShuffleAutoPlace() {
    runAutoPlacement(autoPlacementVariantIndex + 1, 'shuffle');
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
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      togglePieceSelection(placement.pieceId);
      return;
    }
    const point = clientPointToSvg(event);
    if (!point || !svgRef.current) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const pieceIds = state.selectedPieceIds.includes(placement.pieceId)
      ? state.selectedPieceIds.filter((pieceId) =>
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
    setSelectedFeatureId('');
    if (!state.selectedPieceIds.includes(placement.pieceId)) {
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
        message: 'Wall section moved. Sections snap together by shared edges.',
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
      setSelectedFeatureId('');
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
      selectedPieceIds: marquee.additive
        ? [
            ...marquee.initialPieceIds,
            ...hitIds.filter((id) => !marquee.initialPieceIds.includes(id)),
          ]
        : hitIds,
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
    const sectionDragSnapshot = sectionDragUndoSnapshotRef.current;
    if (sectionDragSnapshot && hasUndoableChange(sectionDragSnapshot, latestStateRef.current)) {
      recordUndoSnapshot(sectionDragSnapshot);
    }
    dragRef.current = null;
    sectionDragRef.current = null;
    sectionDragUndoSnapshotRef.current = null;
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

    const selectedPlacedPieceIds = state.selectedPieceIds.filter((pieceId) =>
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
        message: 'Wall section moved. Sections snap together by shared edges.',
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
    const pieceIds = state.selectedPieceIds.includes(placement.pieceId)
      ? state.selectedPieceIds.filter((pieceId) =>
          state.placements.some((candidate) => candidate.pieceId === pieceId),
        )
      : [placement.pieceId];
    if (!state.selectedPieceIds.includes(placement.pieceId)) {
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
    setState((current) => ({ ...current, message: 'Exporting PNG...' }));
    try {
      await downloadPng(getExportInput());
      setState((current) => ({ ...current, message: 'PNG export generated.' }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown export error.';
      setState((current) => ({ ...current, message: `PNG export failed: ${reason}` }));
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (exporting) {
      return;
    }
    setExporting('pdf');
    setState((current) => ({ ...current, message: 'Exporting PDF...' }));
    try {
      await downloadPdf(getExportInput());
      setState((current) => ({ ...current, message: 'PDF export generated.' }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown export error.';
      setState((current) => ({ ...current, message: `PDF export failed: ${reason}` }));
    } finally {
      setExporting(null);
    }
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
      setSelectedFeatureId('');
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
                    state.selectedPieceIds.includes(piece.id) ? 'selected' : ''
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

        <section className="editor-column">
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
                aria-expanded={settingsDrawerOpen}
                onClick={() => setSettingsDrawerOpen(true)}
              >
                <SlidersHorizontal size={18} />
                Placement settings
              </button>
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
                selectedPieceIds={state.selectedPieceIds}
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
              onSelect={togglePieceSelection}
              onFeatureSelect={toggleFeatureSelection}
              onPointerDown={handleStagedPiecePointerDown}
              onFeaturePointerDown={handleStagedFeaturePointerDown}
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
      <div className="visually-hidden" role="status" aria-live="polite">
        {state.message}
        {autoPlacementFailure?.message === state.message
          ? ` Tried ${autoPlacementFailure.diagnostics.attempts.length} layout strategies with ${formatMeasurement(
              autoPlacementFailure.diagnostics.resolvedGapIn,
              state.unit,
            )} spacing and a ${formatMeasurement(
              autoPlacementFailure.diagnostics.resolvedOuterMarginIn,
              state.unit,
            )} wall margin. ${autoPlacementFailure.diagnostics.attempts
              .map((attempt) => `${attempt.family}: ${attempt.reason}`)
              .join(' ')}`
          : ''}
      </div>
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

function isPlacedWallFeature(feature: WallFeature): boolean {
  return feature.placed !== false;
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
        '.wall-feature-block',
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
  artPieceBufferEnabled,
  artPieceBufferGapIn,
}: {
  preview: WallDragPreview | null;
  artPieceBufferEnabled: boolean;
  artPieceBufferGapIn: number;
}) {
  if (!preview) {
    return null;
  }

  const isGroupPreview = preview.itemKind === 'piece' && (preview.pieces?.length ?? 0) > 1;

  const label =
    preview.itemKind === 'piece' && preview.itemCount === 1
      ? fitPieceLabel(preview.label, preview.widthIn, preview.heightIn)
      : null;
  const bufferGapPx =
    artPieceBufferEnabled && preview.itemKind === 'piece'
      ? getPreviewBufferGapPx(
          { widthIn: preview.widthIn, heightIn: preview.heightIn },
          preview,
          artPieceBufferGapIn,
        )
      : 0;
  const previewStyle: React.CSSProperties & { '--art-piece-buffer-gap'?: string } = {
    left: `${preview.clientX}px`,
    top: `${preview.clientY}px`,
    width: `${preview.widthPx}px`,
    height: `${preview.heightPx}px`,
  };
  if (bufferGapPx > 0 || label?.placement === 'outside') {
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
        viewBox={`0 0 ${preview.widthIn} ${preview.heightIn}`}
        aria-hidden="true"
        focusable="false"
      >
        {isGroupPreview ? (
          preview.pieces?.map((piece) => (
            <g key={piece.id} className="piece selected" data-testid="group-drag-preview-piece">
              <rect
                x={piece.xIn}
                y={piece.yIn}
                width={piece.widthIn}
                height={piece.heightIn}
                rx="0.8"
              />
              <PieceLabelSvg
                piece={piece}
                offsetX={piece.xIn}
                offsetY={piece.yIn}
                clipId={`preview-${piece.id}`}
              />
            </g>
          ))
        ) : preview.itemKind === 'piece' ? (
          <g className="piece selected">
            <rect x="0" y="0" width={preview.widthIn} height={preview.heightIn} rx="0.8" />
            {preview.itemCount === 1 ? (
              <PieceLabelSvg
                piece={{
                  id: preview.itemId,
                  label: preview.label,
                  widthIn: preview.widthIn,
                  heightIn: preview.heightIn,
                }}
                offsetX={0}
                offsetY={0}
                clipId={`preview-${preview.itemId}`}
              />
            ) : (
              <text
                x={preview.widthIn / 2}
                y={preview.heightIn / 2}
                className="piece-label"
                dominantBaseline="middle"
                textAnchor="middle"
              >
                {preview.label}
              </text>
            )}
          </g>
        ) : (
          <g className="wall-feature selected">
            <rect
              x="0"
              y="0"
              width={preview.widthIn}
              height={preview.heightIn}
              rx="0.8"
              className="wall-feature-block"
            />
            <text
              x={preview.widthIn / 2}
              y={preview.heightIn / 2}
              className="wall-feature-label"
              dominantBaseline="middle"
              textAnchor="middle"
            >
              {preview.label}
            </text>
          </g>
        )}
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
  piece: Pick<ArtPiece, 'widthIn' | 'heightIn'>,
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

function getWallCanvasBaseViewBox(sections: WallSection[]): WallViewBox {
  const wallBounds = getWallBounds(sections);
  const padding = DEFAULT_WALL_PADDING_IN;
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

function tryCapturePointer(element: Element, pointerId: number) {
  if (!Number.isFinite(pointerId) || typeof element.setPointerCapture !== 'function') {
    return;
  }
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events and older browsers can expose capture without an active pointer.
  }
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
  badge,
  ariaLabel,
  defaultExpanded = true,
  className = '',
  contentClassName = '',
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string | number;
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
          {badge !== undefined ? <span className="count-badge">{badge}</span> : null}
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

function AdvancedDrawer({
  open,
  themeMode,
  applicationTheme,
  features,
  unit,
  message,
  autoPlacementFailure,
  readyToExport,
  exportIssues,
  exporting,
  onClose,
  onThemeModeChange,
  onApplicationThemeChange,
  onFeaturesChange,
  onExportPng,
  onExportPdf,
  onExportJson,
  onImportClick,
  onUnitChange,
  onEditStart,
  onEditEnd,
}: {
  open: boolean;
  themeMode: ThemeMode;
  applicationTheme: ApplicationTheme;
  features: EditorFeatures;
  unit: Unit;
  message: string;
  autoPlacementFailure: { message: string; diagnostics: AutoPlacementDiagnostics } | null;
  readyToExport: boolean;
  exportIssues: string[];
  exporting: 'png' | 'pdf' | null;
  onClose: () => void;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  onApplicationThemeChange: (applicationTheme: ApplicationTheme) => void;
  onFeaturesChange: (patch: Partial<EditorFeatures>, options?: UndoableChangeOptions) => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onImportClick: () => void;
  onUnitChange: (unit: Unit) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  return (
    <div className={`advanced-drawer-layer${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="advanced-drawer-backdrop"
        aria-label="Close advanced settings"
        onClick={onClose}
      />
      <aside
        className="advanced-drawer"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-label="Advanced"
      >
        <div className="advanced-drawer-header">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <h2>Advanced</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close Advanced"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <section className="utility-panel feature-panel" aria-label="Appearance controls">
          <div className="panel-title">
            <h2>Appearance</h2>
          </div>
          <label className="field">
            Appearance
            <select
              value={themeMode}
              onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="field">
            Theme
            <select
              value={applicationTheme}
              onChange={(event) =>
                onApplicationThemeChange(resolveApplicationTheme(event.target.value))
              }
            >
              {applicationThemeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        <CollapsiblePanel
          icon={<SlidersHorizontal size={18} />}
          title="Features"
          ariaLabel="Feature settings"
        >
          <FeatureControls
            features={features}
            unit={unit}
            onUnitChange={onUnitChange}
            onChange={onFeaturesChange}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
          />
        </CollapsiblePanel>
        <section className="status-panel" aria-label="Latest update">
          <p className="status-panel-label">Latest update</p>
          <div className="status-content" role={open ? 'status' : undefined} aria-live="polite">
            <p className="status-message">{message}</p>
            {autoPlacementFailure?.message === message ? (
              <AutoPlacementFailureDetails
                diagnostics={autoPlacementFailure.diagnostics}
                unit={unit}
              />
            ) : null}
          </div>
        </section>
        <ExportPanel
          ready={readyToExport}
          issues={exportIssues}
          exporting={exporting}
          onExportPng={onExportPng}
          onExportPdf={onExportPdf}
          onExportJson={onExportJson}
          onImportClick={onImportClick}
        />
      </aside>
    </div>
  );
}

function PlacementSettingsDrawer({
  open,
  settings,
  selectedFeatureId,
  unit,
  onClose,
  onSettingsChange,
  onFeatureSelect,
  onUnitChange,
  onEditStart,
  onEditEnd,
}: {
  open: boolean;
  settings: AutoPlacementSettings;
  selectedFeatureId: string;
  unit: Unit;
  onClose: () => void;
  onSettingsChange: (settings: AutoPlacementSettings, options?: UndoableChangeOptions) => void;
  onFeatureSelect: (featureId: string) => void;
  onUnitChange: (unit: Unit) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  return (
    <div
      className={`advanced-drawer-layer placement-settings-drawer-layer${open ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className="advanced-drawer-backdrop"
        aria-label="Close placement settings"
        onClick={onClose}
      />
      <aside
        className="advanced-drawer placement-settings-drawer"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-label="Placement settings"
      >
        <div className="advanced-drawer-header">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <h2>Placement settings</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close placement settings"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <AutoPlacementControls
          settings={settings}
          selectedFeatureId={selectedFeatureId}
          unit={unit}
          onUnitChange={onUnitChange}
          onChange={onSettingsChange}
          onFeatureSelect={onFeatureSelect}
          onEditStart={onEditStart}
          onEditEnd={onEditEnd}
        />
      </aside>
    </div>
  );
}

function NumberField({
  label,
  displayLabel,
  info,
  valueIn,
  unit,
  precision = 'position',
  disabled = false,
  error,
  onUnitChange,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  label: string;
  displayLabel?: string;
  info?: string;
  valueIn: number;
  unit: Unit;
  precision?: 'position' | 'size';
  disabled?: boolean;
  error?: string;
  onUnitChange?: (unit: Unit) => void;
  onChange: (valueIn: number) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}) {
  const visibleLabel = displayLabel ?? label;
  const display =
    precision === 'size' ? displaySizeValue(valueIn, unit) : displayValue(valueIn, unit);
  const round = precision === 'size' ? roundToSizePrecision : roundToPrecision;
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!focused) {
      setDraft(display);
    }
  }, [display, focused]);

  const input = (
    <span className="number-input-with-unit">
      <input
        id={inputId}
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
      {onUnitChange ? (
        <select
          className="inline-unit-select"
          aria-label={`${label} unit`}
          value={unit}
          onChange={(event) => onUnitChange(event.target.value as Unit)}
        >
          <option value="in">in</option>
          <option value="cm">cm</option>
        </select>
      ) : null}
    </span>
  );
  const errorMessage = error ? (
    <span id={errorId} className="field-error" role="alert">
      {error}
    </span>
  ) : null;

  return info ? (
    <div className="field">
      <FieldLabelWithInfo htmlFor={inputId} label={visibleLabel} info={info} />
      {input}
      {errorMessage}
    </div>
  ) : (
    <label className="field">
      {visibleLabel}
      {input}
      {errorMessage}
    </label>
  );
}

function FeatureControls({
  features,
  unit,
  onUnitChange,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  features: EditorFeatures;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onChange: (patch: Partial<EditorFeatures>, options?: UndoableChangeOptions) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const unitLabel = unit;

  return (
    <>
      <ToggleFieldWithInfo
        label="Snap to grid"
        checked={features.snapToGrid}
        info="Pieces snap to grid increments while dragging or nudging. Grid size is the increment used when grid snapping is enabled."
        onChange={(checked) => onChange({ snapToGrid: checked })}
      />
      <NumberField
        label={`Grid size (${unitLabel})`}
        displayLabel="Grid size"
        valueIn={features.gridSizeIn}
        unit={unit}
        precision="size"
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(gridSizeIn) =>
          onChange({ gridSizeIn: Math.max(0.125, gridSizeIn) }, { undoable: false })
        }
      />
      <p className="muted feature-help">Snap settings apply while dragging or nudging pieces.</p>
      <ToggleFieldWithInfo
        label="Snap to alignment"
        checked={features.snapToAlignment}
        info="Pieces snap to nearby artwork and wall alignment guides. Alignment tolerance controls how close a piece must be before snapping engages."
        onChange={(checked) => onChange({ snapToAlignment: checked })}
      />
      <ToggleFieldWithInfo
        label="Show alignment guides"
        checked={features.showAlignmentGuides}
        info="Shows dotted guide lines when alignment snapping engages. Turn this off to keep snapping without the visual guides."
        onChange={(checked) => onChange({ showAlignmentGuides: checked })}
      />
      <NumberField
        label={`Alignment tolerance (${unitLabel})`}
        displayLabel="Alignment tolerance"
        valueIn={features.alignmentToleranceIn}
        unit={unit}
        precision="size"
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(alignmentToleranceIn) =>
          onChange(
            { alignmentToleranceIn: Math.max(0.125, alignmentToleranceIn) },
            { undoable: false },
          )
        }
      />
      <ToggleFieldWithInfo
        label="Wall edge buffer"
        checked={features.wallEdgeBuffer}
        info="Wall edge buffer reserves clearance from wall edges. The buffer gap sets the clearance distance used when wall edge buffer is enabled."
        onChange={(checked) => onChange({ wallEdgeBuffer: checked })}
      />
      <NumberField
        label={`Wall edge buffer gap (${unitLabel})`}
        displayLabel="Wall edge buffer gap"
        valueIn={features.wallEdgeBufferGapIn}
        unit={unit}
        precision="size"
        disabled={!features.wallEdgeBuffer}
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(wallEdgeBufferGapIn) =>
          onChange(
            { wallEdgeBufferGapIn: Math.max(0.125, wallEdgeBufferGapIn) },
            { undoable: false },
          )
        }
      />
      <ToggleFieldWithInfo
        label="Art piece buffer"
        checked={features.artPieceBuffer}
        info="Art piece buffer reserves spacing between artwork. The buffer gap sets the spacing distance used when art piece buffer is enabled."
        onChange={(checked) => onChange({ artPieceBuffer: checked })}
      />
      <NumberField
        label={`Art piece buffer gap (${unitLabel})`}
        displayLabel="Art piece buffer gap"
        valueIn={features.artPieceBufferGapIn}
        unit={unit}
        precision="size"
        disabled={!features.artPieceBuffer}
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(artPieceBufferGapIn) =>
          onChange(
            { artPieceBufferGapIn: Math.max(0.125, artPieceBufferGapIn) },
            { undoable: false },
          )
        }
      />
      <ToggleFieldWithInfo
        label="Use absolute installation measurements"
        checked={features.measurementReferenceMode === 'absolute'}
        info="Relative measurements reference the closest edge or neighbor. Absolute measurements use the continuous wall's top-left origin."
        onChange={(checked) =>
          onChange({
            measurementReferenceMode: checked ? 'absolute' : 'relative',
          })
        }
      />
    </>
  );
}

function ToggleFieldWithInfo({
  label,
  checked,
  info,
  onChange,
}: {
  label: string;
  checked: boolean;
  info: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="toggle-field-with-info">
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
      <InfoTooltipButton label={label} info={info} />
    </div>
  );
}

function InfoTooltipButton({ label, info }: { label: string; info: string }) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>(() =>
    calculateTooltipPosition(
      { left: 0, top: 0, width: 0, height: 0 },
      { width: 240, height: 0 },
      { width: 1024, height: 768 },
    ),
  );

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const tooltip = tooltipRef.current;

    if (!button || !tooltip || typeof window === 'undefined') {
      return;
    }

    const triggerRect = button.getBoundingClientRect();
    const tooltipSize = getTooltipElementSize(tooltip);
    const visualViewport = window.visualViewport;
    const viewport = {
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight,
    };
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const nextPosition = calculateTooltipPosition(
      {
        left: triggerRect.left - viewportOffsetLeft,
        top: triggerRect.top - viewportOffsetTop,
        width: triggerRect.width,
        height: triggerRect.height,
      },
      {
        width: tooltipSize.width || 240,
        height: tooltipSize.height || 0,
      },
      viewport,
    );
    setPosition({
      ...nextPosition,
      left: nextPosition.left + viewportOffsetLeft,
      top: nextPosition.top + viewportOffsetTop,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, info, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const visualViewport = window.visualViewport;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    visualViewport?.addEventListener('resize', updatePosition);
    visualViewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      visualViewport?.removeEventListener('resize', updatePosition);
      visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, info, updatePosition]);

  return (
    <span
      className="info-tip"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        className="info-button"
        aria-label={`${label} information`}
        aria-describedby={tooltipId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {createPortal(
        <span
          ref={tooltipRef}
          className={`info-tooltip${isOpen ? ' info-tooltip-open' : ''}`}
          data-placement={position.placement}
          id={tooltipId}
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            maxWidth: position.maxWidth,
            maxHeight: position.maxHeight,
          }}
        >
          {info}
        </span>,
        document.body,
      )}
    </span>
  );
}

function TooltipIconButton({
  ariaLabel,
  tooltip,
  children,
  onClick,
  className,
  wrapperClassName,
  onPointerDown,
}: {
  ariaLabel: string;
  tooltip: string;
  children: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
  wrapperClassName?: string;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>(() =>
    calculateTooltipPosition(
      { left: 0, top: 0, width: 0, height: 0 },
      { width: 180, height: 0 },
      { width: 1024, height: 768 },
    ),
  );

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const tooltipElement = tooltipRef.current;

    if (!button || !tooltipElement || typeof window === 'undefined') {
      return;
    }

    const triggerRect = button.getBoundingClientRect();
    const tooltipSize = getTooltipElementSize(tooltipElement);
    const visualViewport = window.visualViewport;
    const viewport = {
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight,
    };
    const viewportOffsetLeft = visualViewport?.offsetLeft ?? 0;
    const viewportOffsetTop = visualViewport?.offsetTop ?? 0;
    const nextPosition = calculateTooltipPosition(
      {
        left: triggerRect.left - viewportOffsetLeft,
        top: triggerRect.top - viewportOffsetTop,
        width: triggerRect.width,
        height: triggerRect.height,
      },
      {
        width: tooltipSize.width || 180,
        height: tooltipSize.height || 0,
      },
      viewport,
    );
    const resolvedPosition = wrapperClassName?.includes('staged-remove-anchor')
      ? avoidTooltipCollisions(
          nextPosition,
          tooltipSize,
          getStagedPreviewObstacles(button, viewportOffsetLeft, viewportOffsetTop),
          viewport,
        )
      : nextPosition;

    setPosition({
      ...resolvedPosition,
      left: resolvedPosition.left + viewportOffsetLeft,
      top: resolvedPosition.top + viewportOffsetTop,
    });
  }, [wrapperClassName]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, tooltip, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const visualViewport = window.visualViewport;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    visualViewport?.addEventListener('resize', updatePosition);
    visualViewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      visualViewport?.removeEventListener('resize', updatePosition);
      visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, tooltip, updatePosition]);

  return (
    <span
      className={
        wrapperClassName ? `action-tooltip-anchor ${wrapperClassName}` : 'action-tooltip-anchor'
      }
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        className={className ? `icon-button ${className}` : 'icon-button'}
        aria-label={ariaLabel}
        aria-describedby={tooltipId}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        {children}
      </button>
      {createPortal(
        <span
          ref={tooltipRef}
          className={`info-tooltip action-tooltip${isOpen ? ' info-tooltip-open' : ''}`}
          data-placement={position.placement}
          id={tooltipId}
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            maxWidth: position.maxWidth,
            maxHeight: position.maxHeight,
          }}
        >
          {tooltip}
        </span>,
        document.body,
      )}
    </span>
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
  return (
    <span className="field-label-with-info">
      <label htmlFor={htmlFor}>{label}</label>
      {info ? <InfoTooltipButton label={label} info={info} /> : null}
    </span>
  );
}

function HeadingWithInfo({ label, info }: { label: string; info: string }) {
  return (
    <div className="heading-with-info">
      <h3>{label}</h3>
      <InfoTooltipButton label={label} info={info} />
    </div>
  );
}

function getTooltipElementSize(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return {
    width: Math.max(rect.width, element.scrollWidth),
    height: Math.max(rect.height, element.scrollHeight),
  };
}

function getStagedPreviewObstacles(
  button: HTMLButtonElement,
  viewportOffsetLeft: number,
  viewportOffsetTop: number,
) {
  const ownPreviewShell = button.closest('.staged-piece-preview-shell');

  return Array.from(document.querySelectorAll<HTMLElement>('.staged-piece-preview'))
    .filter((preview) => !ownPreviewShell?.contains(preview))
    .map((preview) => {
      const rect = preview.getBoundingClientRect();

      return {
        left: rect.left - viewportOffsetLeft,
        top: rect.top - viewportOffsetTop,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

const WALL_FEATURE_NAME_BASES: Record<WallFeatureType, string> = {
  sofa: 'Sofa',
  bed: 'Bed',
  console: 'Console',
  desk: 'Desk',
  'file-cabinet': 'File cabinet',
  lamp: 'Lamp',
  bookcase: 'Bookcase',
  fireplace: 'Fireplace',
  tv: 'TV',
  window: 'Window',
  door: 'Door',
  custom: 'Wall feature',
};

const WALL_FEATURE_DEFAULT_NAME_PATTERNS = Object.values(WALL_FEATURE_NAME_BASES).map(
  (baseName) => new RegExp(`^${escapeRegExp(baseName)} \\d+$`),
);

function getNextWallFeatureName(
  type: WallFeatureType,
  features: WallFeature[],
  excludedFeatureId?: string,
) {
  const baseName = WALL_FEATURE_NAME_BASES[type];
  const pattern = new RegExp(`^${escapeRegExp(baseName)} (\\d+)$`);
  const maxIndex = features.reduce((currentMax, feature) => {
    if (feature.id === excludedFeatureId) {
      return currentMax;
    }
    const match = pattern.exec(feature.name);
    if (!match) {
      return currentMax;
    }
    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return `${baseName} ${maxIndex + 1}`;
}

function isDefaultWallFeatureName(name: string) {
  return WALL_FEATURE_DEFAULT_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function getWallFeatureRemoveTooltip(type: WallFeatureType) {
  const label = WALL_FEATURE_NAME_BASES[type];
  const tooltipLabel = label === 'TV' ? label : label.toLowerCase();
  return `Remove ${tooltipLabel}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function AutoPlacementControls({
  settings,
  selectedFeatureId,
  unit,
  onUnitChange,
  onChange,
  onFeatureSelect,
  onEditStart,
  onEditEnd,
}: {
  settings: AutoPlacementSettings;
  selectedFeatureId: string;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onChange: (settings: AutoPlacementSettings, options?: UndoableChangeOptions) => void;
  onFeatureSelect: (featureId: string) => void;
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
    const featureId = `feature-${Date.now()}-${index}`;
    const type: WallFeatureType = 'sofa';
    const defaults = getWallFeatureDefaults(type);
    onFeatureSelect(featureId);
    onChange({
      ...settings,
      wallFeatures: [
        ...settings.wallFeatures,
        {
          id: featureId,
          type,
          name: getNextWallFeatureName(type, settings.wallFeatures),
          xIn: 0,
          yIn: 0,
          ...defaults,
          placed: false,
        },
      ],
    });
  }

  function removeFeature(featureId: string) {
    if (selectedFeatureId === featureId) {
      onFeatureSelect('');
    }
    onChange({
      ...settings,
      wallFeatures: settings.wallFeatures.filter((feature) => feature.id !== featureId),
    });
  }

  return (
    <>
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
          htmlFor="auto-placement-wall-setup"
          label="Wall setup"
          info="Available wall sections uses the wall spans you can actually hang art on. Full wall + furniture and features starts from one continuous wall, then keeps art clear of placed sofas, consoles, doors, windows, and other features."
        />
        <select
          id="auto-placement-wall-setup"
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
      </div>
      <div className="field">
        <FieldLabelWithInfo
          htmlFor="auto-placement-context"
          label="Context"
          info="Context sets placement priorities around your wall. Choose a hallway for quick pass-by viewing, or a blank wall for a more relaxed display."
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
            info="Viewing height shifts the group vertically toward the height where people will usually see it. It does not change your wall dimensions."
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
          {settings.wallFeatures.map((feature, index) => {
            const selected = selectedFeatureId === feature.id;

            return (
              <article
                className={`setup-row feature-row ${selected ? 'selected expanded' : 'collapsed'}`}
                key={feature.id}
                onClick={(event) => {
                  if (
                    event.target instanceof HTMLElement &&
                    event.target.closest('input, select, button')
                  ) {
                    return;
                  }
                  onFeatureSelect(feature.id);
                }}
              >
                <div className="row-heading">
                  {selected ? (
                    <input
                      aria-label={`Feature ${index + 1} name`}
                      value={feature.name}
                      onFocus={() => {
                        onEditStart();
                        onFeatureSelect(feature.id);
                      }}
                      onBlur={onEditEnd}
                      onChange={(event) =>
                        updateFeature(feature.id, { name: event.target.value }, { undoable: false })
                      }
                    />
                  ) : (
                    <div className="row-name-readonly" aria-label={`Feature ${index + 1} name`}>
                      {feature.name}
                    </div>
                  )}
                  <TooltipIconButton
                    ariaLabel={`Remove Feature ${index + 1}`}
                    tooltip={getWallFeatureRemoveTooltip(feature.type)}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFeature(feature.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </TooltipIconButton>
                </div>
                <p className="row-summary">
                  {formatMeasurement(feature.widthIn, unit)} x{' '}
                  {formatMeasurement(feature.heightIn, unit)}
                </p>
                <label className="field">
                  Type
                  <select
                    aria-label={`Feature ${index + 1} type`}
                    value={feature.type}
                    onFocus={() => onFeatureSelect(feature.id)}
                    onChange={(event) => {
                      const type = event.target.value as WallFeatureType;
                      const shouldRename = isDefaultWallFeatureName(feature.name);
                      updateFeature(feature.id, {
                        type,
                        name: shouldRename
                          ? getNextWallFeatureName(type, settings.wallFeatures, feature.id)
                          : feature.name,
                        ...getWallFeatureDefaults(type),
                      });
                    }}
                  >
                    <option value="sofa">Sofa</option>
                    <option value="bed">Bed</option>
                    <option value="console">Console</option>
                    <option value="desk">Desk</option>
                    <option value="file-cabinet">File cabinet</option>
                    <option value="lamp">Lamp</option>
                    <option value="bookcase">Bookcase</option>
                    <option value="fireplace">Fireplace</option>
                    <option value="tv">TV</option>
                    <option value="window">Window</option>
                    <option value="door">Door</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <NumberField
                  label={`Feature ${index + 1} width (${unit})`}
                  displayLabel="Width"
                  valueIn={feature.widthIn}
                  unit={unit}
                  precision="size"
                  onUnitChange={onUnitChange}
                  onEditStart={onEditStart}
                  onEditEnd={onEditEnd}
                  onChange={(widthIn) =>
                    updateFeature(
                      feature.id,
                      { widthIn: Math.max(1, widthIn) },
                      { undoable: false },
                    )
                  }
                />
                <NumberField
                  label={`Feature ${index + 1} height (${unit})`}
                  displayLabel="Height"
                  valueIn={feature.heightIn}
                  unit={unit}
                  precision="size"
                  onUnitChange={onUnitChange}
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
                  displayLabel="Clearance"
                  valueIn={
                    feature.clearanceOverrideIn ??
                    getWallFeatureDefaults(feature.type).clearanceOverrideIn
                  }
                  unit={unit}
                  precision="size"
                  onUnitChange={onUnitChange}
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
            );
          })}
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
  onUnitChange,
  onChange,
  onEditStart,
  onEditEnd,
  onImmediateChange,
}: {
  piece: ArtPiece;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
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
            displayLabel="Hook down from top"
            valueIn={piece.hookSpec.topOffsetIn}
            unit={unit}
            onUnitChange={onUnitChange}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(topOffsetIn) => onChange({ ...piece.hookSpec!, topOffsetIn } as HookSpec)}
          />
          <NumberField
            label={`${piece.label} hook from left side`}
            displayLabel="Hook from left side"
            valueIn={piece.hookSpec.leftOffsetIn}
            unit={unit}
            onUnitChange={onUnitChange}
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
            displayLabel="Left hook from left side"
            valueIn={piece.hookSpec.leftSideOffsetIn}
            unit={unit}
            onUnitChange={onUnitChange}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(leftSideOffsetIn) =>
              onChange({ ...piece.hookSpec!, leftSideOffsetIn } as HookSpec)
            }
          />
          <NumberField
            label={`${piece.label} right hook from right side`}
            displayLabel="Right hook from right side"
            valueIn={piece.hookSpec.rightSideOffsetIn}
            unit={unit}
            onUnitChange={onUnitChange}
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
  features,
  selectedPieceId,
  selectedFeatureId,
  unit,
  onAutoPlace,
  onShuffle,
  onSelect,
  onFeatureSelect,
  onPointerDown,
  onFeaturePointerDown,
  onRemovePiece,
  onRemoveFeature,
}: {
  pieces: ArtPiece[];
  placements: Placement[];
  features: WallFeature[];
  selectedPieceId: string;
  selectedFeatureId: string;
  unit: Unit;
  onAutoPlace: () => void;
  onShuffle: () => void;
  onSelect: (pieceId: string) => void;
  onFeatureSelect: (featureId: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, pieceId: string) => void;
  onFeaturePointerDown: (event: React.PointerEvent<HTMLElement>, featureId: string) => void;
  onRemovePiece: (pieceId: string) => void;
  onRemoveFeature: (featureId: string) => void;
}) {
  const stagedPieces = pieces.filter(
    (piece) => !placements.some((placement) => placement.pieceId === piece.id),
  );
  const stagedFeatures = features.filter((feature) => !isPlacedWallFeature(feature));
  const hasStagedItems = stagedPieces.length > 0 || stagedFeatures.length > 0;

  return (
    <section className="staging-tray" role="region" aria-label="Art staging tray with furniture">
      <div className="staging-header">
        <div className="panel-title">
          <PackageOpen size={18} />
          <h2>Staging tray</h2>
        </div>
        <p className="muted">
          Drag unused art, furniture, and features onto the wall, or drag placed items back here.
        </p>
        <div className="staging-actions">
          <button type="button" className="primary" onClick={onAutoPlace}>
            <Wand2 size={18} />
            Auto-place pieces
          </button>
          <button type="button" className="secondary" onClick={onShuffle}>
            <RotateCcw size={18} />
            Shuffle
          </button>
        </div>
      </div>
      {hasStagedItems ? (
        <div className="staged-piece-list">
          {stagedPieces.map((piece) => (
            <StagedArtPiece
              key={piece.id}
              piece={piece}
              selected={piece.id === selectedPieceId}
              unit={unit}
              onSelect={onSelect}
              onPointerDown={onPointerDown}
              onRemovePiece={onRemovePiece}
            />
          ))}
          {stagedFeatures.map((feature) => (
            <div key={feature.id} className="staged-item-shell">
              <div
                className={`staged-piece staged-feature ${
                  feature.id === selectedFeatureId ? 'selected' : ''
                }`}
                role="button"
                tabIndex={0}
                aria-label={`Drag ${feature.name} from staging`}
                onClick={() => onFeatureSelect(feature.id)}
                onPointerDown={(event) => onFeaturePointerDown(event, feature.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onFeatureSelect(feature.id);
                  }
                }}
              >
                <span className="staged-piece-preview-shell">
                  <TooltipIconButton
                    ariaLabel={`Remove ${feature.name} from staging`}
                    tooltip={getWallFeatureRemoveTooltip(feature.type)}
                    className="remove-control-button staged-remove-button"
                    wrapperClassName="staged-remove-anchor"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveFeature(feature.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </TooltipIconButton>
                  <span
                    className="staged-piece-preview staged-feature-preview"
                    data-testid="staged-feature-preview"
                    style={{
                      width: `${feature.widthIn * STAGING_SCALE_PX_PER_IN}px`,
                      height: `${feature.heightIn * STAGING_SCALE_PX_PER_IN}px`,
                    }}
                    aria-hidden="true"
                  />
                </span>
                <span className="staged-piece-caption">
                  <span className="staged-piece-name">{feature.name}</span>
                  <small className="staged-piece-size">
                    {formatMeasurement(feature.widthIn, unit)} x{' '}
                    {formatMeasurement(feature.heightIn, unit)}
                  </small>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-tray">All art, furniture, and features are currently on the wall.</p>
      )}
    </section>
  );
}

function StagedArtPiece({
  piece,
  selected,
  unit,
  onSelect,
  onPointerDown,
  onRemovePiece,
}: {
  piece: ArtPiece;
  selected: boolean;
  unit: Unit;
  onSelect: (pieceId: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, pieceId: string) => void;
  onRemovePiece: (pieceId: string) => void;
}) {
  const previewSize = getStagedArtPreviewSize(piece);

  return (
    <div className="staged-item-shell">
      <div
        className={`staged-piece ${selected ? 'selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Drag ${piece.label} from staging`}
        onClick={() => onSelect(piece.id)}
        onPointerDown={(event) => onPointerDown(event, piece.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(piece.id);
          }
        }}
      >
        <span className="staged-piece-preview-shell">
          <TooltipIconButton
            ariaLabel={`Remove ${piece.label} from staging`}
            tooltip="Remove artwork"
            className="remove-control-button staged-remove-button"
            wrapperClassName="staged-remove-anchor"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onRemovePiece(piece.id);
            }}
          >
            <Trash2 size={14} />
          </TooltipIconButton>
          <span
            className="staged-piece-preview"
            data-testid="staged-piece-preview"
            style={{
              width: `${previewSize.widthPx}px`,
              height: `${previewSize.heightPx}px`,
            }}
            aria-hidden="true"
          />
        </span>
        <span className="staged-piece-caption">
          <span className="staged-piece-name">{piece.label}</span>
          <small className="staged-piece-size">
            {formatMeasurement(piece.widthIn, unit)} x {formatMeasurement(piece.heightIn, unit)}
          </small>
        </span>
      </div>
    </div>
  );
}

function getStagedArtPreviewSize(piece: ArtPiece) {
  const rawWidthPx = piece.widthIn * STAGING_SCALE_PX_PER_IN;
  const rawHeightPx = piece.heightIn * STAGING_SCALE_PX_PER_IN;

  if (
    !Number.isFinite(rawWidthPx) ||
    !Number.isFinite(rawHeightPx) ||
    rawWidthPx <= 0 ||
    rawHeightPx <= 0
  ) {
    return { widthPx: 0, heightPx: 0 };
  }

  const scale = Math.min(1, MAX_STAGED_ART_PREVIEW_HEIGHT_PX / rawHeightPx);

  return {
    widthPx: roundPixelValue(rawWidthPx * scale),
    heightPx: roundPixelValue(rawHeightPx * scale),
  };
}

function roundPixelValue(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function WallCanvas({
  svgRef,
  sections,
  pieces,
  placements,
  selectedPieceIds,
  selectedFeatureId,
  selectedSectionId,
  selectionMarquee,
  groupDragPreview,
  autoPlacementSettings,
  features,
  alignmentGuides,
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
  onFeaturePointerDown,
  onPieceKeyDown,
  onFeatureKeyDown,
  onPointerMove,
  onPointerUp,
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  selectedPieceIds: string[];
  selectedFeatureId: string;
  selectedSectionId: string;
  selectionMarquee: Rect | null;
  groupDragPreview: Placement[];
  autoPlacementSettings: AutoPlacementSettings;
  features: EditorFeatures;
  alignmentGuides: VisibleAlignmentGuides;
  unit: Unit;
  viewBox: WallViewBox;
  onSectionPointerDown: (event: React.PointerEvent<SVGGElement>, section: WallSection) => void;
  onSectionMouseDown: (event: React.MouseEvent<SVGGElement>, section: WallSection) => void;
  onSectionKeyDown: (event: React.KeyboardEvent<SVGGElement>, section: WallSection) => void;
  onPointerDownCapture: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPanPointerDown: (event: React.PointerEvent<SVGRectElement>) => void;
  onPanPointerMove: (event: React.PointerEvent<SVGRectElement>) => void;
  onPanMouseDown: (event: React.MouseEvent<SVGRectElement>) => void;
  onPanMouseMove: (event: React.MouseEvent<SVGRectElement>) => void;
  onPointerDown: (event: React.PointerEvent<SVGRectElement>, placement: Placement) => void;
  onFeaturePointerDown: (event: React.PointerEvent<SVGRectElement>, feature: WallFeature) => void;
  onPieceKeyDown: (event: React.KeyboardEvent<SVGRectElement>, placement: Placement) => void;
  onFeatureKeyDown: (event: React.KeyboardEvent<SVGRectElement>, feature: WallFeature) => void;
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
    return autoPlacementSettings.wallFeatures.filter(isPlacedWallFeature).map((feature) => {
      const rule = resolveWallFeatureRule(feature);
      const featureTop = feature.yIn ?? bounds.maxY - feature.heightIn - rule.clearanceIn;
      const clearanceTop = Math.max(bounds.minY, featureTop - rule.clearanceIn);
      return {
        id: feature.id,
        feature,
        label: feature.name,
        type: feature.type,
        left: feature.xIn,
        top: featureTop,
        clearanceTop,
        width: feature.widthIn,
        height: feature.heightIn,
        clearanceHeight: featureTop + feature.heightIn - clearanceTop,
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
  const wallBounds = useMemo(() => getWallBounds(sections), [sections]);
  const groupPreviewBounds = useMemo(
    () =>
      getGroupBounds(
        sections,
        pieces,
        groupDragPreview,
        groupDragPreview.map((placement) => placement.pieceId),
      ),
    [groupDragPreview, pieces, sections],
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
            onPointerDown={onPanPointerDown}
            onPointerMove={onPanPointerMove}
            onMouseDown={onPanMouseDown}
            onMouseMove={onPanMouseMove}
          />
          {sections.length > 1 ? (
            <g
              className={
                section.id === selectedSectionId
                  ? 'wall-section-handle selected'
                  : 'wall-section-handle'
              }
              role="button"
              tabIndex={0}
              aria-pressed={section.id === selectedSectionId}
              aria-label={`Move ${section.name}`}
              onPointerDown={(event) => onSectionPointerDown(event, section)}
              onMouseDown={(event) => onSectionMouseDown(event, section)}
              onKeyDown={(event) => onSectionKeyDown(event, section)}
            >
              <rect
                x={offsetXIn - 3.8}
                y={offsetYIn - 4.9}
                width={3.6}
                height={3.6}
                rx={0.6}
                className="wall-section-handle-background"
              />
              <Move
                x={offsetXIn - 3.1}
                y={offsetYIn - 4.2}
                width={2.2}
                height={2.2}
                strokeWidth={2.5}
                className="wall-section-handle-icon"
                aria-hidden="true"
              />
            </g>
          ) : null}
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
      {alignmentGuides.guides.map((guide) =>
        guide.axis === 'x' ? (
          <g
            key={`alignment-guide-${guide.axis}-${guide.coordinateIn}-${guide.kind}`}
            className={alignmentGuides.isLingering ? 'is-lingering' : ''}
          >
            <line
              x1={guide.coordinateIn}
              y1={wallBounds.minY}
              x2={guide.coordinateIn}
              y2={wallBounds.maxY}
              className={`alignment-snap-guide-backdrop ${guide.kind} ${
                alignmentGuides.isLingering ? 'is-lingering' : ''
              }`}
            />
            <line
              x1={guide.coordinateIn}
              y1={wallBounds.minY}
              x2={guide.coordinateIn}
              y2={wallBounds.maxY}
              className={`alignment-snap-guide ${guide.kind} ${
                alignmentGuides.isLingering ? 'is-lingering' : ''
              }`}
              data-testid="alignment-guide-x"
            />
          </g>
        ) : (
          <g
            key={`alignment-guide-${guide.axis}-${guide.coordinateIn}-${guide.kind}`}
            className={alignmentGuides.isLingering ? 'is-lingering' : ''}
          >
            <line
              x1={wallBounds.minX}
              y1={guide.coordinateIn}
              x2={wallBounds.maxX}
              y2={guide.coordinateIn}
              className={`alignment-snap-guide-backdrop ${guide.kind} ${
                alignmentGuides.isLingering ? 'is-lingering' : ''
              }`}
            />
            <line
              x1={wallBounds.minX}
              y1={guide.coordinateIn}
              x2={wallBounds.maxX}
              y2={guide.coordinateIn}
              className={`alignment-snap-guide ${guide.kind} ${
                alignmentGuides.isLingering ? 'is-lingering' : ''
              }`}
              data-testid="alignment-guide-y"
            />
          </g>
        ),
      )}
      {featureBlocks.map((block) => (
        <g
          key={block.id}
          className={block.id === selectedFeatureId ? 'wall-feature selected' : 'wall-feature'}
        >
          <rect
            x={block.left}
            y={block.clearanceTop}
            width={block.width}
            height={block.clearanceHeight}
            className="wall-feature-clearance"
            aria-label={`${block.label} blocked area`}
          />
          <rect
            x={block.left}
            y={block.top}
            width={block.width}
            height={block.height}
            rx="0.8"
            className="wall-feature-block"
            focusable="false"
            role="button"
            tabIndex={0}
            aria-pressed={block.id === selectedFeatureId}
            aria-label={`Move ${block.label}`}
            onPointerDown={(event) => onFeaturePointerDown(event, block.feature)}
            onKeyDown={(event) => onFeatureKeyDown(event, block.feature)}
          />
          <text
            x={block.left + block.width / 2}
            y={block.top + block.height / 2}
            className="wall-feature-label"
            dominantBaseline="middle"
            textAnchor="middle"
          >
            {block.label}
          </text>
        </g>
      ))}
      {placements.map((placement) => {
        const piece = piecesById.get(placement.pieceId);
        if (!piece) {
          return null;
        }
        const offset = sectionOffsets.get(placement.sectionId) ?? { offsetXIn: 0, offsetYIn: 0 };
        const offsetX = offset.offsetXIn;
        const offsetY = offset.offsetYIn;
        const selected = selectedPieceIds.includes(piece.id);
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
      {groupDragPreview.map((placement) => {
        const piece = piecesById.get(placement.pieceId);
        if (!piece) {
          return null;
        }
        const offset = sectionOffsets.get(placement.sectionId) ?? { offsetXIn: 0, offsetYIn: 0 };
        return (
          <rect
            key={`group-preview-${placement.pieceId}`}
            x={offset.offsetXIn + placement.xIn}
            y={offset.offsetYIn + placement.yIn}
            width={piece.widthIn}
            height={piece.heightIn}
            rx="0.8"
            className="group-drag-piece-preview"
          />
        );
      })}
      {groupPreviewBounds ? (
        <rect
          x={groupPreviewBounds.left}
          y={groupPreviewBounds.top}
          width={groupPreviewBounds.right - groupPreviewBounds.left}
          height={groupPreviewBounds.bottom - groupPreviewBounds.top}
          className="group-drag-bounds-preview"
        />
      ) : null}
      {selectionMarquee ? (
        <rect
          x={selectionMarquee.left}
          y={selectionMarquee.top}
          width={selectionMarquee.right - selectionMarquee.left}
          height={selectionMarquee.bottom - selectionMarquee.top}
          className="selection-marquee"
          data-testid="selection-marquee"
        />
      ) : null}
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
  exporting,
  onExportPng,
  onExportPdf,
  onExportJson,
  onImportClick,
  className,
}: {
  ready: boolean;
  issues: string[];
  exporting: 'png' | 'pdf' | null;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onImportClick: () => void;
  className?: string;
}) {
  const printExportRequirement = ready
    ? exporting
      ? 'A print export is already in progress.'
      : 'Export the print layout.'
    : `Complete export requirements: ${issues.join(' ')}`;

  return (
    <CollapsiblePanel
      icon={<Download size={18} />}
      title="Design files"
      ariaLabel="Design file settings"
      className={className}
    >
      <div className="export-section">
        <HeadingWithInfo
          label="Print/export layout"
          info="PNG and PDF exports include the visual layout, piece table, and installation measurements."
        />
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
            disabled={!ready || exporting !== null}
            aria-busy={exporting === 'png'}
            title={printExportRequirement}
            onClick={onExportPng}
          >
            <FileImage size={18} />
            Export PNG
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!ready || exporting !== null}
            aria-busy={exporting === 'pdf'}
            title={printExportRequirement}
            onClick={onExportPdf}
          >
            <FileText size={18} />
            Export PDF
          </button>
        </div>
      </div>
      <div className="export-section">
        <HeadingWithInfo
          label="Save/load design"
          info="JSON is the editable project file for reopening this design and continuing later."
        />
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
      <p className="muted feature-help scale-note">
        Print exports are for installation; JSON files are for editing this design later.
      </p>
    </CollapsiblePanel>
  );
}

function MeasurementsTable({
  instructions,
}: {
  instructions: ReturnType<typeof buildMeasurementInstructions>;
}) {
  const rows = buildMeasurementTableRows(instructions);
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
            {MEASUREMENT_TABLE_HEADERS.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-measurements">
                Place a piece on the wall to see installation measurements.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.order}-${row.pieceLabel}`}>
                <td>{row.order}</td>
                <td>
                  <strong>{row.pieceLabel}</strong>
                  <span className="measurement-secondary">{row.sectionName}</span>
                </td>
                <td>
                  <span>
                    <strong>Top:</strong> {row.topReference}
                  </span>
                  <span>
                    <strong>Side:</strong> {row.sideReference}
                  </span>
                </td>
                <td>{row.hooks}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {rows.length > 0 ? (
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
    (value.showAlignmentGuides === undefined || typeof value.showAlignmentGuides === 'boolean') &&
    isFiniteNumber(value.alignmentToleranceIn) &&
    typeof value.wallEdgeBuffer === 'boolean' &&
    isFiniteNumber(value.wallEdgeBufferGapIn) &&
    typeof value.artPieceBuffer === 'boolean' &&
    isFiniteNumber(value.artPieceBufferGapIn) &&
    (value.measurementReferenceMode === undefined ||
      value.measurementReferenceMode === 'relative' ||
      value.measurementReferenceMode === 'absolute')
  );
}

function normalizeEditorFeatures(value: EditorFeatures): EditorFeatures {
  return {
    ...defaultState.features,
    ...value,
    showAlignmentGuides: value.showAlignmentGuides ?? defaultState.features.showAlignmentGuides,
    measurementReferenceMode:
      value.measurementReferenceMode === 'absolute' ? 'absolute' : 'relative',
  };
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
    (value.yIn === undefined || isFiniteNumber(value.yIn)) &&
    isFiniteNumber(value.widthIn) &&
    isFiniteNumber(value.heightIn) &&
    (value.placed === undefined || typeof value.placed === 'boolean') &&
    (value.clearanceOverrideIn === undefined || isFiniteNumber(value.clearanceOverrideIn))
  );
}

function isWallFeatureType(value: unknown): value is WallFeatureType {
  return (
    value === 'sofa' ||
    value === 'bed' ||
    value === 'console' ||
    value === 'desk' ||
    value === 'file-cabinet' ||
    value === 'lamp' ||
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
    const validPieceIds = new Set(parsed.pieces?.map((piece) => piece.id) ?? []);
    const persistedRecord = parsed as Record<string, unknown>;
    const persistedSelectedPieceIds = Array.isArray(parsed.selectedPieceIds)
      ? [
          ...new Set(
            parsed.selectedPieceIds.filter(
              (pieceId): pieceId is string =>
                typeof pieceId === 'string' && validPieceIds.has(pieceId),
            ),
          ),
        ]
      : typeof persistedRecord.selectedPieceId === 'string' &&
          validPieceIds.has(persistedRecord.selectedPieceId)
        ? [persistedRecord.selectedPieceId]
        : [];
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
      features: isEditorFeatures(parsed.features)
        ? normalizeEditorFeatures(parsed.features)
        : defaultState.features,
      autoPlacementSettings: isAutoPlacementSettings(parsed.autoPlacementSettings)
        ? parsed.autoPlacementSettings
        : defaultState.autoPlacementSettings,
      selectedPieceIds: persistedSelectedPieceIds,
      message: defaultState.message,
    };
  } catch {
    return defaultState;
  }
}
