import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WallDragPreviewOverlay, type WallDragPreview } from './WallDragPreviewOverlay';

const basePreview: WallDragPreview = {
  itemId: 'piece-1',
  itemKind: 'piece',
  label: 'Sunset',
  widthIn: 16,
  heightIn: 20,
  clientX: 100,
  clientY: 200,
  widthPx: 48,
  heightPx: 60,
  itemCount: 1,
};

describe('WallDragPreviewOverlay', () => {
  it('renders nothing when there is no preview', () => {
    const { container } = render(
      <WallDragPreviewOverlay
        preview={null}
        artPieceBufferEnabled={false}
        artPieceBufferGapIn={0}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a positioned preview for a single piece', () => {
    render(
      <WallDragPreviewOverlay
        preview={basePreview}
        artPieceBufferEnabled={false}
        artPieceBufferGapIn={0}
      />,
    );

    const preview = screen.getByTestId('wall-drag-preview');
    expect(preview).toHaveStyle({ left: '100px', top: '200px', width: '48px', height: '60px' });
    expect(preview).not.toHaveClass('art-piece-buffer-preview');
  });

  it('applies the art-piece-buffer-preview class and CSS variable when a buffer gap applies', () => {
    render(
      <WallDragPreviewOverlay
        preview={basePreview}
        artPieceBufferEnabled={true}
        artPieceBufferGapIn={2}
      />,
    );

    const preview = screen.getByTestId('wall-drag-preview');
    expect(preview).toHaveClass('art-piece-buffer-preview');
  });

  it('renders each piece of a group preview', () => {
    render(
      <WallDragPreviewOverlay
        preview={{
          ...basePreview,
          itemCount: 2,
          pieces: [
            { id: 'piece-1', label: 'A', widthIn: 10, heightIn: 10, xIn: 0, yIn: 0 },
            { id: 'piece-2', label: 'B', widthIn: 10, heightIn: 10, xIn: 12, yIn: 0 },
          ],
        }}
        artPieceBufferEnabled={false}
        artPieceBufferGapIn={0}
      />,
    );

    expect(screen.getAllByTestId('group-drag-preview-piece')).toHaveLength(2);
  });
});
