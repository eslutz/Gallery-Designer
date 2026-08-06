import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RenderableItem } from './RenderableItem';

describe('RenderableItem', () => {
  it('renders wall artwork with its fitted label and hook marks', () => {
    const { container } = render(
      <svg>
        <RenderableItem
          item={{
            kind: 'artwork',
            artwork: {
              id: 'artwork-1',
              label: 'Large framed print',
              widthIn: 20,
              heightIn: 16,
              hookSpec: { count: 1, leftOffsetIn: 10, topOffsetIn: 2 },
            },
            xIn: 4,
            yIn: 6,
          }}
          profile="wall"
          clipId="wall-artwork-1"
        />
      </svg>,
    );

    expect(container.querySelector('.piece rect')).toHaveAttribute('x', '4');
    expect(container.querySelectorAll('.piece-label tspan')).not.toHaveLength(0);
    expect(container.querySelectorAll('.hook-mark')).toHaveLength(1);
  });

  it('renders wall features with a label and clearance geometry', () => {
    const { container } = render(
      <svg>
        <RenderableItem
          item={{
            kind: 'feature',
            feature: {
              id: 'feature-1',
              type: 'sofa',
              name: 'Sofa 1',
              xIn: 8,
              yIn: 42,
              widthIn: 84,
              heightIn: 30,
            },
            xIn: 8,
            yIn: 42,
            clearance: { topIn: 34, heightIn: 38 },
          }}
          profile="wall"
          clipId="wall-feature-1"
        />
      </svg>,
    );

    expect(container.querySelector('.wall-feature-clearance')).toHaveAttribute('y', '34');
    expect(container.querySelector('.wall-feature-label')).toHaveTextContent('Sofa 1');
  });

  it('keeps tray items compact while drag previews retain art annotations', () => {
    const item = {
      kind: 'artwork' as const,
      artwork: {
        id: 'artwork-1',
        label: 'Large framed print',
        widthIn: 20,
        heightIn: 16,
        hookSpec: { count: 1 as const, leftOffsetIn: 10, topOffsetIn: 2 },
      },
      xIn: 0,
      yIn: 0,
      selected: true,
    };
    const { container, rerender } = render(
      <svg>
        <RenderableItem item={item} profile="tray" clipId="tray-artwork-1" />
      </svg>,
    );

    expect(container.querySelector('.piece.selected')).toBeInTheDocument();
    expect(container.querySelector('.piece-label')).not.toBeInTheDocument();
    expect(container.querySelector('.hook-mark')).not.toBeInTheDocument();

    rerender(
      <svg>
        <RenderableItem item={item} profile="drag-preview" clipId="preview-artwork-1" />
      </svg>,
    );

    expect(container.querySelector('.piece-label')).toBeInTheDocument();
    expect(container.querySelector('.hook-mark')).toBeInTheDocument();
  });
});
