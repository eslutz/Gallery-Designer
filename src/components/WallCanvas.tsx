import { Move, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getGroupBounds } from '../lib/multiSelection';
import type { Rect } from '../lib/placement';
import type { AlignmentGuide } from '../lib/snapping';
import { formatMeasurement } from '../lib/units';
import {
  getWallBounds,
  getWallExteriorEdges,
  getInsetWallExteriorPaths,
  getWallLayout,
  toClosedSvgPath,
} from '../lib/wall';
import type { WallViewBox } from '../lib/wallZoom';
import { isPlacedWallFeature, resolveWallFeatureRule } from '../lib/wallFeatures';
import type {
  ArtPiece,
  AutoPlacementSettings,
  EditorFeatures,
  Placement,
  Unit,
  WallFeature,
  WallSection,
} from '../types';
import { RenderableItem } from './RenderableItem';
import { TooltipIconButton } from './InfoTooltip';

export interface VisibleAlignmentGuides {
  guides: AlignmentGuide[];
  isLingering: boolean;
}

interface WallRemoveControl {
  id: string;
  itemId: string;
  itemKind: 'artwork' | 'feature';
  label: string;
  xIn: number;
  yIn: number;
}

export function WallCanvas({
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
  onRemovePlacement,
  onRemoveFeaturePlacement,
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
  groupDragPreview: readonly Placement[];
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
  onRemovePlacement: (pieceId: string) => void;
  onRemoveFeaturePlacement: (featureId: string) => void;
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
}) {
  const [hoveredWallItemId, setHoveredWallItemId] = useState<string | null>(null);
  const wallRemoveControlHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showWallRemoveControl(itemId: string) {
    if (wallRemoveControlHideTimeoutRef.current !== null) {
      clearTimeout(wallRemoveControlHideTimeoutRef.current);
      wallRemoveControlHideTimeoutRef.current = null;
    }
    setHoveredWallItemId(itemId);
  }

  function hideWallRemoveControl(itemId: string) {
    if (wallRemoveControlHideTimeoutRef.current !== null) {
      clearTimeout(wallRemoveControlHideTimeoutRef.current);
    }
    wallRemoveControlHideTimeoutRef.current = setTimeout(() => {
      setHoveredWallItemId((current) => (current === itemId ? null : current));
      wallRemoveControlHideTimeoutRef.current = null;
    }, 120);
  }

  useEffect(
    () => () => {
      if (wallRemoveControlHideTimeoutRef.current !== null) {
        clearTimeout(wallRemoveControlHideTimeoutRef.current);
      }
    },
    [],
  );

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
  const wallRemoveControls = useMemo<WallRemoveControl[]>(
    () => [
      ...featureBlocks.map((block) => ({
        id: `feature-${block.id}`,
        itemId: block.id,
        itemKind: 'feature' as const,
        label: block.label,
        xIn: block.left + block.width,
        yIn: block.top,
      })),
      ...placements.flatMap((placement) => {
        const piece = piecesById.get(placement.pieceId);
        if (!piece) {
          return [];
        }
        const offset = sectionOffsets.get(placement.sectionId) ?? { offsetXIn: 0, offsetYIn: 0 };
        return [
          {
            id: `artwork-${piece.id}`,
            itemId: piece.id,
            itemKind: 'artwork' as const,
            label: piece.label,
            xIn: offset.offsetXIn + placement.xIn + piece.widthIn,
            yIn: offset.offsetYIn + placement.yIn,
          },
        ];
      }),
    ],
    [featureBlocks, piecesById, placements, sectionOffsets],
  );
  const [wallRemoveControlPositions, setWallRemoveControlPositions] = useState<
    Record<string, { leftPx: number; topPx: number }>
  >({});

  useLayoutEffect(() => {
    const updatePositions = () => {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const matrix = svg?.getScreenCTM?.();
      if (!svg || !rect || rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const nextPositions = Object.fromEntries(
        wallRemoveControls.map((control) => {
          const clientX = matrix
            ? control.xIn * matrix.a + control.yIn * (matrix.c ?? 0) + matrix.e
            : rect.left + ((control.xIn - viewBox.x) / viewBox.width) * rect.width;
          const clientY = matrix
            ? control.xIn * (matrix.b ?? 0) + control.yIn * matrix.d + matrix.f
            : rect.top + ((control.yIn - viewBox.y) / viewBox.height) * rect.height;
          return [
            control.id,
            {
              leftPx: clientX - rect.left,
              topPx: clientY - rect.top,
            },
          ];
        }),
      );
      setWallRemoveControlPositions((current) =>
        JSON.stringify(current) === JSON.stringify(nextPositions) ? current : nextPositions,
      );
    };

    updatePositions();

    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updatePositions);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef, viewBox.x, viewBox.y, viewBox.width, viewBox.height, wallRemoveControls]);
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
    <>
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
              className={
                section.id === selectedSectionId ? 'wall-section selected' : 'wall-section'
              }
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
          <RenderableItem
            key={block.id}
            item={{
              kind: 'feature',
              feature: block.feature,
              xIn: block.left,
              yIn: block.top,
              selected: block.id === selectedFeatureId,
              clearance: {
                topIn: block.clearanceTop,
                heightIn: block.clearanceHeight,
              },
            }}
            profile="wall"
            clipId={`wall-${block.id}`}
            shapeProps={{
              focusable: 'false',
              role: 'button',
              tabIndex: 0,
              'aria-pressed': block.id === selectedFeatureId,
              'aria-label': `Move ${block.label}`,
              onPointerDown: (event) => onFeaturePointerDown(event, block.feature),
              onKeyDown: (event) => onFeatureKeyDown(event, block.feature),
            }}
            groupProps={{
              onPointerEnter: () => showWallRemoveControl(`feature-${block.id}`),
              onPointerLeave: () => hideWallRemoveControl(`feature-${block.id}`),
              onMouseEnter: () => showWallRemoveControl(`feature-${block.id}`),
              onMouseLeave: () => hideWallRemoveControl(`feature-${block.id}`),
            }}
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
          const selected = selectedPieceIds.includes(piece.id);
          const pieceX = offsetX + placement.xIn;
          const pieceY = offsetY + placement.yIn;
          return (
            <RenderableItem
              key={piece.id}
              item={{
                kind: 'artwork',
                artwork: piece,
                xIn: pieceX,
                yIn: pieceY,
                selected,
              }}
              profile="wall"
              clipId={piece.id}
              shapeProps={{
                focusable: 'false',
                role: 'button',
                tabIndex: 0,
                'aria-pressed': selected,
                'aria-label': `Move ${piece.label}`,
                onPointerDown: (event) => onPointerDown(event, placement),
                onKeyDown: (event) => onPieceKeyDown(event, placement),
              }}
              groupProps={{
                onPointerEnter: () => showWallRemoveControl(`artwork-${piece.id}`),
                onPointerLeave: () => hideWallRemoveControl(`artwork-${piece.id}`),
                onMouseEnter: () => showWallRemoveControl(`artwork-${piece.id}`),
                onMouseLeave: () => hideWallRemoveControl(`artwork-${piece.id}`),
              }}
            />
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
      {wallRemoveControls.map((control) => {
        const position = wallRemoveControlPositions[control.id];
        // Hover has no equivalent on touch, so a tap-selected piece would
        // never reveal its remove control on mobile if this only checked
        // hover state — fall back to selection so touch users can reach it.
        const isSelected =
          control.itemKind === 'artwork'
            ? selectedPieceIds.includes(control.itemId)
            : selectedFeatureId === control.itemId;
        const visible = hoveredWallItemId === control.id || isSelected;
        return (
          <div
            key={control.id}
            className={
              visible ? 'wall-piece-remove-control is-visible' : 'wall-piece-remove-control'
            }
            data-world-x={control.xIn}
            data-world-y={control.yIn}
            style={
              position ? { left: `${position.leftPx}px`, top: `${position.topPx}px` } : undefined
            }
            onPointerEnter={() => showWallRemoveControl(control.id)}
            onPointerLeave={() => hideWallRemoveControl(control.id)}
            onMouseEnter={() => showWallRemoveControl(control.id)}
            onMouseLeave={() => hideWallRemoveControl(control.id)}
          >
            <TooltipIconButton
              ariaLabel={`Return ${control.label} to staging`}
              tooltip="Return to staging"
              className="remove-control-button staged-remove-button wall-piece-remove-button"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (control.itemKind === 'artwork') {
                  onRemovePlacement(control.itemId);
                } else {
                  onRemoveFeaturePlacement(control.itemId);
                }
              }}
            >
              <X size={14} />
            </TooltipIconButton>
          </div>
        );
      })}
    </>
  );
}
