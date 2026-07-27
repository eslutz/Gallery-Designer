import { fitArtworkLabel } from '../lib/artworkLabel';
import { getPreviewBufferGapPx } from '../lib/stagingPreview';
import type { ArtPiece, HookSpec, WallFeature } from '../types';
import { RenderableItem } from './RenderableItem';

export type DragItemKind = 'piece' | 'feature';

export interface DragPreviewPiece {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  hookSpec?: HookSpec;
  xIn: number;
  yIn: number;
}

export interface WallDragPreview {
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
  artwork?: ArtPiece;
  feature?: WallFeature;
  pieces?: DragPreviewPiece[];
}

export function WallDragPreviewOverlay({
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
      ? fitArtworkLabel(preview.label, preview.widthIn, preview.heightIn)
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
            <g key={piece.id} data-testid="group-drag-preview-piece">
              <RenderableItem
                item={{
                  kind: 'artwork',
                  artwork: piece,
                  xIn: piece.xIn,
                  yIn: piece.yIn,
                  selected: true,
                }}
                profile="drag-preview"
                clipId={`preview-${piece.id}`}
              />
            </g>
          ))
        ) : preview.itemKind === 'piece' ? (
          <RenderableItem
            item={{
              kind: 'artwork',
              artwork: preview.artwork ?? {
                id: preview.itemId,
                label: preview.label,
                widthIn: preview.widthIn,
                heightIn: preview.heightIn,
              },
              xIn: 0,
              yIn: 0,
              selected: true,
            }}
            profile="drag-preview"
            clipId={`preview-${preview.itemId}`}
          />
        ) : (
          <RenderableItem
            item={{
              kind: 'feature',
              feature: preview.feature ?? {
                id: preview.itemId,
                type: 'custom',
                name: preview.label,
                xIn: 0,
                yIn: 0,
                widthIn: preview.widthIn,
                heightIn: preview.heightIn,
              },
              xIn: 0,
              yIn: 0,
              selected: true,
            }}
            profile="drag-preview"
            clipId={`preview-${preview.itemId}`}
          />
        )}
      </svg>
    </div>
  );
}
