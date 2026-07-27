import { PackageOpen, Plus, RotateCcw, Settings, Trash2, Wand2 } from 'lucide-react';
import { getWallFeatureRemoveTooltip } from '../lib/wallFeatureNaming';
import { isPlacedWallFeature } from '../lib/wallFeatures';
import { getStagedItemPreviewSize, type StagedItemInput } from '../lib/stagingPreview';
import { formatMeasurement } from '../lib/units';
import type { ArtPiece, Placement, Unit, WallFeature } from '../types';
import { TooltipIconButton } from './InfoTooltip';
import { RenderableItem } from './RenderableItem';

export function StagingTray({
  pieces,
  placements,
  features,
  selectedPieceId,
  selectedFeatureId,
  unit,
  onAutoPlace,
  onShuffle,
  onOpenPlacementSettings,
  onSelect,
  onFeatureSelect,
  onPointerDown,
  onFeaturePointerDown,
  onPlacePiece,
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
  onOpenPlacementSettings: () => void;
  onSelect: (pieceId: string) => void;
  onFeatureSelect: (featureId: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, pieceId: string) => void;
  onFeaturePointerDown: (event: React.PointerEvent<HTMLElement>, featureId: string) => void;
  onPlacePiece: (pieceId: string) => void;
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
          <TooltipIconButton
            ariaLabel="Shuffle"
            tooltip="Shuffle layout"
            buttonClassName="secondary"
            onClick={onShuffle}
          >
            <RotateCcw size={18} />
            Shuffle
          </TooltipIconButton>
          <TooltipIconButton
            ariaLabel="Auto-placement options"
            tooltip="Auto-placement options"
            className="secondary"
            onClick={onOpenPlacementSettings}
          >
            <Settings size={18} aria-hidden="true" focusable="false" />
          </TooltipIconButton>
        </div>
      </div>
      {hasStagedItems ? (
        <div className="staged-piece-list">
          {stagedPieces.map((piece) => (
            <StagedItem
              key={piece.id}
              item={{ kind: 'artwork', artwork: piece }}
              selected={piece.id === selectedPieceId}
              unit={unit}
              onSelect={onSelect}
              onPointerDown={onPointerDown}
              onPlace={onPlacePiece}
              onRemove={onRemovePiece}
            />
          ))}
          {stagedFeatures.map((feature) => (
            <StagedItem
              key={feature.id}
              item={{ kind: 'feature', feature }}
              selected={feature.id === selectedFeatureId}
              unit={unit}
              onSelect={onFeatureSelect}
              onPointerDown={onFeaturePointerDown}
              onRemove={onRemoveFeature}
            />
          ))}
        </div>
      ) : (
        <p className="empty-tray">All art, furniture, and features are currently on the wall.</p>
      )}
    </section>
  );
}

export function StagedItem({
  item,
  selected,
  unit,
  onSelect,
  onPointerDown,
  onPlace,
  onRemove,
}: {
  item: StagedItemInput;
  selected: boolean;
  unit: Unit;
  onSelect: (itemId: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, itemId: string) => void;
  onPlace?: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const displayItem = item.kind === 'artwork' ? item.artwork : item.feature;
  const displayLabel = item.kind === 'artwork' ? item.artwork.label : item.feature.name;
  const previewSize = getStagedItemPreviewSize(item);
  const previewTestId = item.kind === 'artwork' ? 'staged-piece-preview' : 'staged-feature-preview';
  const removeTooltip =
    item.kind === 'artwork' ? 'Remove artwork' : getWallFeatureRemoveTooltip(item.feature.type);

  return (
    <div className="staged-item-shell">
      <div
        className={`staged-piece ${item.kind === 'feature' ? 'staged-feature' : ''} ${
          selected ? 'selected' : ''
        }`}
        role="button"
        tabIndex={0}
        aria-label={`Drag ${displayLabel} from staging`}
        onClick={() => onSelect(displayItem.id)}
        onPointerDown={(event) => onPointerDown(event, displayItem.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(displayItem.id);
          }
        }}
      >
        <span className="staged-piece-preview-shell">
          <TooltipIconButton
            ariaLabel={`Remove ${displayLabel} from staging`}
            tooltip={removeTooltip}
            className="remove-control-button staged-remove-button"
            wrapperClassName="staged-remove-anchor"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(displayItem.id);
            }}
          >
            <Trash2 size={14} />
          </TooltipIconButton>
          <svg
            className={`staged-piece-preview ${
              item.kind === 'feature' ? 'staged-feature-preview' : ''
            }`}
            data-testid={previewTestId}
            style={{
              width: `${previewSize.widthPx}px`,
              height: `${previewSize.heightPx}px`,
            }}
            viewBox={`0 0 ${displayItem.widthIn} ${displayItem.heightIn}`}
            aria-hidden="true"
            focusable="false"
          >
            <RenderableItem
              item={
                item.kind === 'artwork'
                  ? {
                      kind: 'artwork',
                      artwork: item.artwork,
                      xIn: 0,
                      yIn: 0,
                      selected,
                    }
                  : {
                      kind: 'feature',
                      feature: item.feature,
                      xIn: 0,
                      yIn: 0,
                      selected,
                    }
              }
              profile="tray"
              clipId={`tray-${displayItem.id}`}
            />
          </svg>
          {onPlace ? (
            <TooltipIconButton
              ariaLabel={`Place ${displayLabel} on the wall`}
              tooltip="Place on wall"
              buttonClassName="staged-place-center-button"
              wrapperClassName="staged-place-center-anchor"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onPlace(displayItem.id);
              }}
            >
              <Plus size={22} aria-hidden="true" focusable="false" />
            </TooltipIconButton>
          ) : null}
        </span>
        <span className="staged-piece-caption">
          <span className="staged-piece-name">{displayLabel}</span>
          <small className="staged-piece-size">
            {formatMeasurement(displayItem.widthIn, unit)} x{' '}
            {formatMeasurement(displayItem.heightIn, unit)}
          </small>
        </span>
      </div>
    </div>
  );
}
