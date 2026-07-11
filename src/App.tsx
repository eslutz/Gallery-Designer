import {
  Download,
  FileImage,
  FileJson,
  FileText,
  Move,
  PackageOpen,
  Plus,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { autoPlacePieces } from './lib/autoPlace';
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
import type { ArtPiece, EditorFeatures, HookSpec, Placement, Unit, WallSection } from './types';

const STORAGE_KEY = 'gallery-designer-state-v1';
const PIECE_DRAG_MIME = 'application/x-gallery-piece-id';
const STAGING_SCALE_PX_PER_IN = 4;
const DRAG_PREVIEW_SCALE_PX_PER_IN = 3;
const SUPPRESS_TEXT_SELECTION_CLASS = 'suppress-text-selection';

interface GalleryState {
  unit: Unit;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  features: EditorFeatures;
  selectedPieceId: string;
  message: string;
}

interface DragState {
  pieceId: string;
  startPoint: DOMPoint;
  startPlacement: Placement;
  latestPlacement: Placement;
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

const defaultState: GalleryState = {
  unit: 'in',
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
  selectedPieceId: 'piece-1',
  message: 'Enter wall and art dimensions, then place pieces on the scaled wall.',
};

export default function App() {
  const [state, setState] = useState<GalleryState>(() => loadState());
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [wallDragPreview, setWallDragPreview] = useState<WallDragPreview | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const sectionDragRef = useRef<SectionDragState | null>(null);

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
    () => buildMeasurementInstructions(state.sections, state.pieces, state.placements, state.unit),
    [state.sections, state.pieces, state.placements, state.unit],
  );
  const selectedPiece = state.pieces.find((piece) => piece.id === state.selectedPieceId);
  const selectedPlacement = state.placements.find(
    (placement) => placement.pieceId === state.selectedPieceId,
  );
  const readyToExport = allIssues.length === 0 && state.pieces.length > 0;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    function handleWindowPointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (drag) {
        event.preventDefault();
        updatePointerDrag(event);
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      finishPieceDrag(event);
    }

    function handleWindowDragEnd() {
      setWallDragPreview(null);
      stopSuppressingTextSelection();
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDragEnd);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('dragend', handleWindowDragEnd);
      window.removeEventListener('drop', handleWindowDragEnd);
    };
  });

  useEffect(() => {
    window.addEventListener('keydown', handleCanvasKeyDown);
    return () => window.removeEventListener('keydown', handleCanvasKeyDown);
  });

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
    setState((current) => {
      const section = getSectionById(current.sections, proposedPlacement.sectionId);
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
        message: 'Placement updated.',
      };
    });
  }

  function nudgePiece(proposedPlacement: Placement) {
    setState((current) => ({
      ...current,
      selectedPieceId: proposedPlacement.pieceId,
      placements: [
        ...current.placements.filter(
          (candidate) => candidate.pieceId !== proposedPlacement.pieceId,
        ),
        proposedPlacement,
      ],
      message: 'Piece position adjusted.',
    }));
  }

  function resetWall() {
    setState((current) => ({
      ...current,
      placements: [],
      selectedPieceId: current.pieces[0]?.id ?? '',
      message: 'Wall reset. All pieces returned to the staging tray.',
    }));
  }

  function updateFeatures(patch: Partial<EditorFeatures>) {
    setState((current) => ({
      ...current,
      features: {
        ...current.features,
        ...patch,
      },
      message: 'Feature settings updated.',
    }));
  }

  function removePlacement(pieceId: string) {
    setState((current) => ({
      ...current,
      selectedPieceId: pieceId,
      placements: current.placements.filter((placement) => placement.pieceId !== pieceId),
      message: 'Piece returned to the staging tray.',
    }));
  }

  function handlePieceDragStart(event: React.DragEvent, pieceId: string) {
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(PIECE_DRAG_MIME, pieceId);
    event.dataTransfer.setData('text/plain', pieceId);
    startSuppressingTextSelection();
    if (piece) {
      const size = getRenderedPieceSize(piece);
      setPieceDragImage(
        event.dataTransfer,
        piece,
        size,
        state.features.artPieceBuffer
          ? getPreviewBufferGapPx(piece, size, state.features.artPieceBufferGapIn)
          : 0,
      );
    }
    selectPiece(pieceId);
  }

  function handleWallDragOver(event: React.DragEvent<SVGSVGElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const pieceId = getDraggedPieceId(event.dataTransfer);
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    if (!piece) {
      return;
    }

    const placement = getDropPlacement(event, piece);
    if (placement) {
      showSnappedPreview(placement, piece, getRenderedPieceSize(piece), event);
    }
  }

  function handleWallDrop(event: React.DragEvent<SVGSVGElement>) {
    event.preventDefault();
    const pieceId = getDraggedPieceId(event.dataTransfer);
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    if (!piece) {
      return;
    }

    const placement = getDropPlacement(event, piece);
    if (placement) {
      commitPiecePlacement(placement);
    }
    setWallDragPreview(null);
  }

  function handleStagingDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleStagingDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const pieceId = getDraggedPieceId(event.dataTransfer);
    if (pieceId && state.pieces.some((piece) => piece.id === pieceId)) {
      removePlacement(pieceId);
    }
  }

  function handleSectionPointerDown(
    event: React.PointerEvent<SVGRectElement>,
    section: WallSection,
  ) {
    event.preventDefault();
    selectSection(section.id);
    const point = clientPointToSvg(event);
    if (!point) {
      return;
    }
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    sectionDragRef.current = {
      sectionId: section.id,
      startPoint: point,
      startXIn: section.xIn ?? 0,
      startYIn: section.yIn ?? 0,
    };
  }

  function handleAutoPlace() {
    const result = autoPlacePieces(state.sections, state.pieces);
    if (!result.ok) {
      setState((current) => ({ ...current, message: result.message }));
      return;
    }

    setState((current) => ({
      ...current,
      placements: result.placements,
      selectedPieceId: result.placements[0]?.pieceId ?? current.selectedPieceId,
      message:
        result.layoutKind === 'grid'
          ? 'Auto-placement created a grid layout.'
          : 'Auto-placement created an organic layout.',
    }));
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
      startPoint: point,
      startPlacement: placement,
      latestPlacement: placement,
      previewWidthPx: rect.width,
      previewHeightPx: rect.height,
    };
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
    const sectionDrag = sectionDragRef.current;
    if (sectionDrag) {
      const point = clientPointToSvg(event);
      if (!point) {
        return;
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
      return;
    }

    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    event.preventDefault();
    updatePointerDrag(event);
  }

  function handlePointerUp(event?: React.PointerEvent<SVGSVGElement>) {
    finishPieceDrag(event);
  }

  function finishPieceDrag(event?: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>) {
    const drag = dragRef.current;
    if (drag && event && pointerIsOverStagingTray(event)) {
      removePlacement(drag.pieceId);
    } else if (drag) {
      commitPiecePlacement(drag.latestPlacement);
    }
    dragRef.current = null;
    sectionDragRef.current = null;
    setWallDragPreview(null);
    stopSuppressingTextSelection();
  }

  function pointerIsOverStagingTray(
    event: Pick<React.PointerEvent | PointerEvent, 'clientX' | 'clientY'>,
  ): boolean {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element?.closest('[aria-label="Art staging tray"]') !== null;
  }

  function handleCanvasKeyDown(event: KeyboardEvent) {
    if (isTextEntryTarget(event.target)) {
      return;
    }
    if (!selectedPiece || !selectedPlacement) {
      return;
    }
    const step = event.shiftKey ? 1 : 1 / 8;
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

  function clientPointToSvg(
    event: Pick<React.PointerEvent | React.DragEvent, 'clientX' | 'clientY'>,
  ): DOMPoint | null {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }
    if (typeof svg.getScreenCTM !== 'function') {
      return null;
    }
    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return null;
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

  function updatePointerDrag(
    event: Pick<PointerEvent | React.PointerEvent, 'clientX' | 'clientY'>,
  ) {
    const drag = dragRef.current;
    const point = clientPointToSvg(event);
    if (!drag || !point) {
      return;
    }

    drag.latestPlacement = {
      ...drag.startPlacement,
      xIn: roundToPrecision(drag.startPlacement.xIn + point.x - drag.startPoint.x),
      yIn: roundToPrecision(drag.startPlacement.yIn + point.y - drag.startPoint.y),
    };
    showSnappedPreview(
      drag.latestPlacement,
      state.pieces.find((piece) => piece.id === drag.pieceId),
      { widthPx: drag.previewWidthPx, heightPx: drag.previewHeightPx },
      event,
    );
  }

  function showSnappedPreview(
    placement: Placement,
    piece: ArtPiece | undefined,
    size: { widthPx: number; heightPx: number },
    fallbackPoint: Pick<React.PointerEvent | React.DragEvent | PointerEvent, 'clientX' | 'clientY'>,
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

  function getDropPlacement(
    event: Pick<React.DragEvent, 'clientX' | 'clientY'>,
    piece: ArtPiece,
  ): Placement | null {
    const point = clientPointToSvg(event);
    const layout = getWallLayout(state.sections);
    const targetLayout = point
      ? layout.find(
          ({ section, offsetXIn }) =>
            point.x >= offsetXIn &&
            point.x <= offsetXIn + section.widthIn &&
            point.y >= (section.yIn ?? 0) &&
            point.y <= (section.yIn ?? 0) + section.heightIn,
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

  return (
    <main className="app-shell" onPointerDown={handlePagePointerDown}>
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo" src="/gallery-wall-logo.svg" alt="" aria-hidden="true" />
          <div className="brand-copy">
            <h1>Gallery Designer</h1>
            <p>Plan a continuous wall, place art to scale, and export installation measurements.</p>
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="setup-panel" aria-label="Setup controls">
          <PanelTitle icon={<Ruler size={18} />} title="Wall sections" />
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
                    onChange={(widthIn) => updateSection(section.id, { widthIn })}
                  />
                  <NumberField
                    label={`Section ${index + 1} height`}
                    valueIn={section.heightIn}
                    unit={state.unit}
                    precision="size"
                    onChange={(heightIn) => updateSection(section.id, { heightIn })}
                  />
                </div>
                <label className="field">
                  Corner after
                  <select
                    value={section.cornerAfter}
                    onChange={(event) =>
                      updateSection(section.id, {
                        cornerAfter: event.target.value as WallSection['cornerAfter'],
                      })
                    }
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

          <PanelTitle icon={<Move size={18} />} title="Art pieces" />
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
                    onFocus={() => selectPiece(piece.id)}
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
                    onChange={(widthIn) => updatePiece(piece.id, { widthIn })}
                  />
                  <NumberField
                    label={`Piece ${index + 1} height`}
                    valueIn={piece.heightIn}
                    unit={state.unit}
                    precision="size"
                    onChange={(heightIn) => updatePiece(piece.id, { heightIn })}
                  />
                </div>
                <HookControls
                  piece={piece}
                  unit={state.unit}
                  onChange={(hookSpec) => updatePiece(piece.id, { hookSpec })}
                />
              </article>
            ))}
          </div>
          <button type="button" className="secondary full-width" onClick={addPiece}>
            <Plus size={18} />
            Add art piece
          </button>
        </aside>

        <section className="editor-column">
          <div className="editor-toolbar" role="toolbar" aria-label="Editor controls">
            <label className="field compact">
              Units
              <select
                value={state.unit}
                onChange={(event) =>
                  setState((current) => ({ ...current, unit: event.target.value as Unit }))
                }
              >
                <option value="in">Inches</option>
                <option value="cm">Centimeters</option>
              </select>
            </label>
            <button type="button" className="primary" onClick={handleAutoPlace}>
              <Wand2 size={18} />
              Auto-place pieces
            </button>
            <button type="button" className="secondary" onClick={resetWall}>
              <RotateCcw size={18} />
              Reset wall
            </button>
          </div>

          <div className="canvas-card">
            <WallCanvas
              svgRef={svgRef}
              sections={state.sections}
              pieces={state.pieces}
              placements={state.placements}
              selectedPieceId={state.selectedPieceId}
              selectedSectionId={selectedSectionId}
              features={state.features}
              unit={state.unit}
              onDragOver={handleWallDragOver}
              onDrop={handleWallDrop}
              onSectionPointerDown={handleSectionPointerDown}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
            <StagingTray
              pieces={state.pieces}
              placements={state.placements}
              selectedPieceId={state.selectedPieceId}
              unit={state.unit}
              onSelect={togglePieceSelection}
              onDragStart={handlePieceDragStart}
              onDragOver={handleStagingDragOver}
              onDrop={handleStagingDrop}
            />
          </div>

          <MeasurementsTable instructions={measurements} />
        </section>

        <aside className="right-panel" aria-label="Details and export">
          <FeatureControls features={state.features} unit={state.unit} onChange={updateFeatures} />
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

  const label = getPreviewPieceLabelLayout(piece, preview);
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
      <PiecePreviewLabel layout={label} />
    </div>
  );
}

function PiecePreviewLabel({ layout }: { layout: PreviewPieceLabelLayout }) {
  return (
    <span
      className={
        layout.placement === 'inside'
          ? 'preview-piece-label'
          : 'preview-piece-label outside-preview-piece-label'
      }
      style={{ fontSize: `${layout.fontSizePx}px`, lineHeight: `${layout.lineHeightPx}px` }}
    >
      {layout.lines.map((line, index) => (
        <span className="preview-piece-label-line" key={`${line}-${index}`}>
          {line}
        </span>
      ))}
    </span>
  );
}

function startSuppressingTextSelection() {
  document.body.classList.add(SUPPRESS_TEXT_SELECTION_CLASS);
}

function stopSuppressingTextSelection() {
  document.body.classList.remove(SUPPRESS_TEXT_SELECTION_CLASS);
}

function setPieceDragImage(
  dataTransfer: DataTransfer,
  piece: ArtPiece,
  size: { widthPx: number; heightPx: number },
  artPieceBufferGapPx: number,
) {
  if (typeof dataTransfer.setDragImage !== 'function') {
    return;
  }

  const preview = document.createElement('div');
  preview.className = 'piece-drag-preview';
  preview.style.width = `${size.widthPx}px`;
  preview.style.height = `${size.heightPx}px`;
  if (artPieceBufferGapPx > 0) {
    preview.classList.add('art-piece-buffer-preview');
    preview.style.setProperty('--art-piece-buffer-gap', `${artPieceBufferGapPx}px`);
    preview.style.overflow = 'visible';
  }
  const label = getPreviewPieceLabelLayout(piece, size);
  if (label.placement === 'outside') {
    preview.style.overflow = 'visible';
  }
  appendPreviewPieceLabel(preview, label);
  document.body.append(preview);
  dataTransfer.setDragImage(preview, size.widthPx / 2, size.heightPx / 2);
  window.setTimeout(() => preview.remove(), 0);
}

interface PreviewPieceLabelLayout {
  lines: string[];
  fontSizePx: number;
  lineHeightPx: number;
  placement: 'inside' | 'outside';
}

function getPreviewPieceLabelLayout(
  piece: ArtPiece,
  size: { widthPx: number; heightPx: number },
): PreviewPieceLabelLayout {
  const layout = fitPieceLabel(piece.label, piece.widthIn, piece.heightIn);
  const scale = Math.min(size.widthPx / piece.widthIn, size.heightPx / piece.heightIn);
  const pixelsPerInch = Number.isFinite(scale) && scale > 0 ? scale : DRAG_PREVIEW_SCALE_PX_PER_IN;
  const fontSizePx = layout.fontSize * pixelsPerInch;

  return {
    lines: layout.lines,
    fontSizePx,
    lineHeightPx: fontSizePx * 1.15,
    placement: layout.placement,
  };
}

function appendPreviewPieceLabel(container: HTMLElement, layout: PreviewPieceLabelLayout) {
  const label = document.createElement('span');
  label.className =
    layout.placement === 'inside'
      ? 'preview-piece-label'
      : 'preview-piece-label outside-preview-piece-label';
  label.style.fontSize = `${layout.fontSizePx}px`;
  label.style.lineHeight = `${layout.lineHeightPx}px`;

  for (const line of layout.lines) {
    const lineElement = document.createElement('span');
    lineElement.className = 'preview-piece-label-line';
    lineElement.textContent = line;
    label.append(lineElement);
  }

  container.append(label);
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

function getDraggedPieceId(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(PIECE_DRAG_MIME) || dataTransfer.getData('text/plain');
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

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function NumberField({
  label,
  valueIn,
  unit,
  precision = 'position',
  onChange,
}: {
  label: string;
  valueIn: number;
  unit: Unit;
  precision?: 'position' | 'size';
  onChange: (valueIn: number) => void;
}) {
  const display =
    precision === 'size' ? displaySizeValue(valueIn, unit) : displayValue(valueIn, unit);
  const round = precision === 'size' ? roundToSizePrecision : roundToPrecision;
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);

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
        inputMode="decimal"
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(display);
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
    </label>
  );
}

function FeatureControls({
  features,
  unit,
  onChange,
}: {
  features: EditorFeatures;
  unit: Unit;
  onChange: (patch: Partial<EditorFeatures>) => void;
}) {
  const unitLabel = unit;

  return (
    <section className="utility-panel feature-panel" aria-label="Feature settings">
      <PanelTitle icon={<SlidersHorizontal size={18} />} title="Features" />
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
        onChange={(gridSizeIn) => onChange({ gridSizeIn: Math.max(0.125, gridSizeIn) })}
      />
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
        onChange={(alignmentToleranceIn) =>
          onChange({ alignmentToleranceIn: Math.max(0.125, alignmentToleranceIn) })
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
        onChange={(wallEdgeBufferGapIn) =>
          onChange({ wallEdgeBufferGapIn: Math.max(0.125, wallEdgeBufferGapIn) })
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
        onChange={(artPieceBufferGapIn) =>
          onChange({ artPieceBufferGapIn: Math.max(0.125, artPieceBufferGapIn) })
        }
      />
    </section>
  );
}

function HookControls({
  piece,
  unit,
  onChange,
}: {
  piece: ArtPiece;
  unit: Unit;
  onChange: (hookSpec: HookSpec | undefined) => void;
}) {
  const count = piece.hookSpec?.count ?? 0;

  return (
    <div className="hook-controls">
      <label className="field">
        Hooks
        <select
          value={count}
          onChange={(event) => {
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
            onChange={(topOffsetIn) => onChange({ ...piece.hookSpec!, topOffsetIn } as HookSpec)}
          />
          <NumberField
            label={`${piece.label} hook from left side`}
            valueIn={piece.hookSpec.leftOffsetIn}
            unit={unit}
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
            onChange={(leftSideOffsetIn) =>
              onChange({ ...piece.hookSpec!, leftSideOffsetIn } as HookSpec)
            }
          />
          <NumberField
            label={`${piece.label} right hook from right side`}
            valueIn={piece.hookSpec.rightSideOffsetIn}
            unit={unit}
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
  onDragStart,
  onDragOver,
  onDrop,
}: {
  pieces: ArtPiece[];
  placements: Placement[];
  selectedPieceId: string;
  unit: Unit;
  onSelect: (pieceId: string) => void;
  onDragStart: (event: React.DragEvent, pieceId: string) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
}) {
  const stagedPieces = pieces.filter(
    (piece) => !placements.some((placement) => placement.pieceId === piece.id),
  );

  return (
    <section
      className="staging-tray"
      role="region"
      aria-label="Art staging tray"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
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
              draggable
              aria-label={`Drag ${piece.label} from staging`}
              onClick={() => onSelect(piece.id)}
              onDragStart={(event) => onDragStart(event, piece.id)}
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
  features,
  unit,
  onDragOver,
  onDrop,
  onSectionPointerDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  svgRef: React.RefObject<SVGSVGElement>;
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  selectedPieceId: string;
  selectedSectionId: string;
  features: EditorFeatures;
  unit: Unit;
  onDragOver: (event: React.DragEvent<SVGSVGElement>) => void;
  onDrop: (event: React.DragEvent<SVGSVGElement>) => void;
  onSectionPointerDown: (event: React.PointerEvent<SVGRectElement>, section: WallSection) => void;
  onPointerDown: (event: React.PointerEvent<SVGRectElement>, placement: Placement) => void;
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
}) {
  const layout = getWallLayout(sections);
  const wallBounds = getWallBounds(sections);
  const exteriorEdges = getWallExteriorEdges(sections);
  const gridSize = features.snapToGrid ? Math.max(0.125, features.gridSizeIn) : 6;
  const bufferPadding = features.wallEdgeBuffer ? features.wallEdgeBufferGapIn : 0;
  const padding = 14 + bufferPadding;
  const wallEdgeBufferPaths = features.wallEdgeBuffer
    ? getInsetWallExteriorPaths(sections, features.wallEdgeBufferGapIn)
    : [];
  const viewBox = `${wallBounds.minX - padding} ${wallBounds.minY - padding} ${Math.max(
    1,
    wallBounds.width + padding * 2,
  )} ${Math.max(1, wallBounds.height + padding * 2 + 10)}`;

  return (
    <svg
      ref={svgRef}
      className="wall-canvas"
      role="img"
      aria-label="Scaled gallery wall layout"
      viewBox={viewBox}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <pattern id="minor-grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          <path
            d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
            fill="none"
            stroke="#dbe5de"
            strokeWidth="0.18"
          />
        </pattern>
      </defs>
      <rect
        x={wallBounds.minX - padding}
        y={wallBounds.minY - padding}
        width={wallBounds.width + padding * 2}
        height={wallBounds.height + padding * 2}
        fill="url(#minor-grid)"
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
            aria-label={`Move ${section.name}`}
            onPointerDown={(event) => onSectionPointerDown(event, section)}
          />
          <text x={offsetXIn + 2} y={offsetYIn - 2} className="section-label">
            {section.name} - {formatMeasurement(section.widthIn, unit)} x{' '}
            {formatMeasurement(section.heightIn, unit)}
          </text>
        </g>
      ))}
      {exteriorEdges.map((edge) => (
        <line
          key={`${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`}
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
      {placements.map((placement) => {
        const piece = pieces.find((candidate) => candidate.id === placement.pieceId);
        if (!piece) {
          return null;
        }
        const offsetX = getSectionOffsetX(sections, placement.sectionId);
        const offsetY = getSectionOffsetY(sections, placement.sectionId);
        const selected = piece.id === selectedPieceId;
        const pieceX = offsetX + placement.xIn;
        const pieceY = offsetY + placement.yIn;
        const label = fitPieceLabel(piece.label, piece.widthIn, piece.heightIn);
        const clipId = `piece-label-clip-${piece.id}`;
        const labelLineHeight = label.fontSize * 1.15;
        const labelCenterY =
          label.placement === 'inside'
            ? pieceY + piece.heightIn / 2 - ((label.lines.length - 1) * labelLineHeight) / 2
            : pieceY + piece.heightIn + labelLineHeight;
        return (
          <g key={piece.id} className={selected ? 'piece selected' : 'piece'}>
            {label.placement === 'inside' ? (
              <clipPath id={clipId}>
                <rect
                  x={pieceX + label.padding}
                  y={pieceY + label.padding}
                  width={Math.max(0.1, piece.widthIn - label.padding * 2)}
                  height={Math.max(0.1, piece.heightIn - label.padding * 2)}
                />
              </clipPath>
            ) : null}
            <rect
              x={pieceX}
              y={pieceY}
              width={piece.widthIn}
              height={piece.heightIn}
              rx="0.8"
              focusable="false"
              role="button"
              aria-label={`Move ${piece.label}`}
              onPointerDown={(event) => onPointerDown(event, placement)}
            />
            <text
              x={pieceX + piece.widthIn / 2}
              y={labelCenterY}
              textAnchor="middle"
              dominantBaseline="middle"
              className={
                label.placement === 'inside' ? 'piece-label' : 'piece-label outside-piece-label'
              }
              clipPath={label.placement === 'inside' ? `url(#${clipId})` : undefined}
              style={{ fontSize: `${label.fontSize}px` }}
            >
              {label.lines.map((line, index) => (
                <tspan
                  key={`${piece.id}-label-${index}`}
                  x={pieceX + piece.widthIn / 2}
                  dy={index === 0 ? 0 : labelLineHeight}
                >
                  {line}
                </tspan>
              ))}
            </text>
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

function fitPieceLabel(label: string, widthIn: number, heightIn: number) {
  const padding = Math.min(1, Math.max(0.35, Math.min(widthIn, heightIn) * 0.08));
  const availableWidth = Math.max(0.5, widthIn - padding * 2);
  const availableHeight = Math.max(0.5, heightIn - padding * 2);
  const text = label.trim().replace(/\s+/g, ' ') || 'Untitled';
  const fontSizes = [3, 2.5, 2, 1.6, 1.25, 1];
  const minimumInsideFontSize = 1.25;

  for (const fontSize of fontSizes) {
    const lines = wrapLabelLines(text, availableWidth, fontSize);
    const lineHeight = fontSize * 1.15;
    if (
      fontSize >= minimumInsideFontSize &&
      lines.length * lineHeight <= availableHeight &&
      lines.every((line) => labelLineFits(line, availableWidth, fontSize))
    ) {
      return { lines, fontSize, padding, placement: 'inside' as const };
    }
  }

  return { lines: [text], fontSize: 1.35, padding, placement: 'outside' as const };
}

function wrapLabelLines(label: string, availableWidth: number, fontSize: number): string[] {
  const maxCharacters = Math.max(1, Math.floor(availableWidth / (fontSize * 0.55)));
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
  return line.length * fontSize * 0.55 <= availableWidth;
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
    <section className="utility-panel">
      <PanelTitle icon={<Download size={18} />} title="Export" />
      <div className="export-section">
        <h3>Print/export layout</h3>
        <p className="muted">
          PNG and PDF exports include the visual layout, piece table, and installation measurements.
        </p>
        {issues.length > 0 ? (
          <ul className="issue-list">
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
    </section>
  );
}

function MeasurementsTable({
  instructions,
}: {
  instructions: ReturnType<typeof buildMeasurementInstructions>;
}) {
  return (
    <section className="measurements-panel">
      <h2>Installation measurements</h2>
      <table aria-label="Installation measurements">
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
          {instructions.map((instruction) => (
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
          ))}
        </tbody>
      </table>
    </section>
  );
}

function loadState(): GalleryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }
    const parsed = JSON.parse(raw) as GalleryState;
    if (!Array.isArray(parsed.sections) || !Array.isArray(parsed.pieces)) {
      return defaultState;
    }
    return {
      ...defaultState,
      ...parsed,
      sections: normalizeWallSections(parsed.sections),
      features: { ...defaultState.features, ...(parsed.features ?? {}) },
      message: defaultState.message,
    };
  } catch {
    return defaultState;
  }
}
