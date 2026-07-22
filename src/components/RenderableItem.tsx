import type { ReactNode, SVGProps } from 'react';
import { fitArtworkLabel, getArtworkLabelLineHeight } from '../lib/artworkLabel';
import { getHookPoints } from '../lib/hooks';
import type { ArtPiece, WallFeature } from '../types';

export type RenderableItemProfile = 'wall' | 'tray' | 'drag-preview';

export type RenderableItemInput =
  | {
      kind: 'artwork';
      artwork: ArtPiece;
      xIn: number;
      yIn: number;
      selected?: boolean;
    }
  | {
      kind: 'feature';
      feature: WallFeature;
      xIn: number;
      yIn: number;
      selected?: boolean;
      clearance?: {
        topIn: number;
        heightIn: number;
      };
    };

type ItemShapeProps = Omit<
  SVGProps<SVGRectElement>,
  'className' | 'height' | 'width' | 'x' | 'y'
> & {
  className?: string;
};

type ItemGroupProps = Omit<SVGProps<SVGGElement>, 'className'>;

interface RenderableItemProps {
  item: RenderableItemInput;
  profile: RenderableItemProfile;
  clipId: string;
  shapeProps?: ItemShapeProps;
  groupProps?: ItemGroupProps;
  children?: ReactNode;
}

export function RenderableItem({
  item,
  profile,
  clipId,
  shapeProps,
  groupProps,
  children,
}: RenderableItemProps) {
  const { className: shapeClassName, ...restShapeProps } = shapeProps ?? {};
  const className = [
    'renderable-item',
    `renderable-item--${profile}`,
    item.kind === 'artwork' ? 'piece' : 'wall-feature',
    item.selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (item.kind === 'artwork') {
    const { artwork, xIn, yIn } = item;
    const showAnnotations = profile !== 'tray';

    return (
      <g {...groupProps} className={className} data-render-profile={profile}>
        <rect
          {...restShapeProps}
          x={xIn}
          y={yIn}
          width={artwork.widthIn}
          height={artwork.heightIn}
          rx="0.8"
          className={['renderable-item-shape', shapeClassName].filter(Boolean).join(' ')}
        />
        {showAnnotations ? (
          <ArtworkAnnotations artwork={artwork} xIn={xIn} yIn={yIn} clipId={clipId} />
        ) : null}
        {children}
      </g>
    );
  }

  const { feature, xIn, yIn, clearance } = item;
  const showAnnotations = profile !== 'tray';
  const showClearance = profile === 'wall' && clearance !== undefined;

  return (
    <g {...groupProps} className={className} data-render-profile={profile}>
      {showClearance ? (
        <rect
          x={xIn}
          y={clearance.topIn}
          width={feature.widthIn}
          height={clearance.heightIn}
          className="wall-feature-clearance"
          aria-label={`${feature.name} blocked area`}
        />
      ) : null}
      <rect
        {...restShapeProps}
        x={xIn}
        y={yIn}
        width={feature.widthIn}
        height={feature.heightIn}
        rx="0.8"
        className={['wall-feature-block', 'renderable-item-shape', shapeClassName]
          .filter(Boolean)
          .join(' ')}
      />
      {showAnnotations ? (
        <text
          x={xIn + feature.widthIn / 2}
          y={yIn + feature.heightIn / 2}
          className="wall-feature-label"
          dominantBaseline="middle"
          textAnchor="middle"
        >
          {feature.name}
        </text>
      ) : null}
      {children}
    </g>
  );
}

function ArtworkAnnotations({
  artwork,
  xIn,
  yIn,
  clipId,
}: {
  artwork: ArtPiece;
  xIn: number;
  yIn: number;
  clipId: string;
}) {
  const label = fitArtworkLabel(artwork.label, artwork.widthIn, artwork.heightIn);
  const labelLineHeight = getArtworkLabelLineHeight(label.fontSize);
  const labelCenterY =
    label.placement === 'inside'
      ? yIn + artwork.heightIn / 2 - ((label.lines.length - 1) * labelLineHeight) / 2
      : yIn + artwork.heightIn + labelLineHeight;
  const labelCenterX = xIn + artwork.widthIn / 2;
  const resolvedClipId = `piece-label-clip-${clipId}`;

  return (
    <>
      {label.placement === 'inside' ? (
        <clipPath id={resolvedClipId}>
          <rect
            x={xIn + label.padding}
            y={yIn + label.padding}
            width={Math.max(0.1, artwork.widthIn - label.padding * 2)}
            height={Math.max(0.1, artwork.heightIn - label.padding * 2)}
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
      {getHookPoints(artwork).map((hook, index) => (
        <circle
          key={`${artwork.id}-hook-${index}`}
          cx={xIn + hook.xIn}
          cy={yIn + hook.yIn}
          r="1.2"
          className="hook-mark"
        />
      ))}
    </>
  );
}
