import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WallCanvas } from './WallCanvas';
import type { WallViewBox } from './zoom';
import type {
  ArtPiece,
  AutoPlacementSettings,
  EditorFeatures,
  Placement,
  WallSection,
} from '../../types';

const section: WallSection = {
  id: 'section-1',
  name: 'Section 1',
  widthIn: 96,
  heightIn: 96,
};

const piece: ArtPiece = {
  id: 'piece-1',
  label: 'Sunset',
  widthIn: 16,
  heightIn: 20,
};

const otherPiece: ArtPiece = {
  id: 'piece-2',
  label: 'Mountains',
  widthIn: 10,
  heightIn: 10,
};

const placement: Placement = {
  pieceId: 'piece-1',
  sectionId: 'section-1',
  xIn: 10,
  yIn: 10,
};

const otherPlacement: Placement = {
  pieceId: 'piece-2',
  sectionId: 'section-1',
  xIn: 40,
  yIn: 20,
};

const features: EditorFeatures = {
  snapToGrid: false,
  gridSizeIn: 1,
  snapToAlignment: false,
  showAlignmentGuides: false,
  alignmentToleranceIn: 0.25,
  wallEdgeBuffer: false,
  wallEdgeBufferGapIn: 0,
  artPieceBuffer: false,
  artPieceBufferGapIn: 0,
  measurementReferenceMode: 'relative',
};

const autoPlacementSettings: AutoPlacementSettings = {
  wallSetupMode: 'available-sections',
  context: { kind: 'blank', viewingPosture: 'standing' },
  layoutPreference: 'auto',
  wallFeatures: [],
};

const viewBox: WallViewBox = { x: 0, y: 0, width: 96, height: 96 };

const noop = vi.fn();

function baseProps() {
  return {
    svgRef: createRef<SVGSVGElement>(),
    sections: [section],
    pieces: [piece, otherPiece],
    placements: [placement, otherPlacement],
    selectedPieceIds: [] as string[],
    selectedFeatureId: '',
    selectedSectionId: '',
    selectionMarquee: null,
    groupDragPreview: [] as Placement[],
    autoPlacementSettings,
    features,
    alignmentGuides: { guides: [], isLingering: false },
    unit: 'in' as const,
    viewBox,
    onSectionPointerDown: noop,
    onSectionMouseDown: noop,
    onSectionKeyDown: noop,
    onPointerDownCapture: noop,
    onPanPointerDown: noop,
    onPanPointerMove: noop,
    onPanMouseDown: noop,
    onPanMouseMove: noop,
    onPointerDown: noop,
    onFeaturePointerDown: noop,
    onPieceKeyDown: noop,
    onFeatureKeyDown: noop,
    onRemovePlacement: noop,
    onRemoveFeaturePlacement: noop,
    onPointerMove: noop,
    onPointerUp: noop,
  };
}

describe('WallCanvas', () => {
  it('renders the wall svg with a section and placed pieces', () => {
    const { container } = render(<WallCanvas {...baseProps()} />);

    const svg = container.querySelector('svg.wall-canvas');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('role', 'img');
    expect(container.querySelectorAll('.wall-section')).toHaveLength(1);
    expect(container.querySelectorAll('.piece')).toHaveLength(2);
  });

  it('marks selected pieces with the selected class and aria-pressed', () => {
    const { container } = render(<WallCanvas {...baseProps()} selectedPieceIds={['piece-1']} />);

    const pieceGroup = container.querySelector('.piece.selected');
    expect(pieceGroup).not.toBeNull();
    expect(pieceGroup?.querySelector('[aria-pressed="true"]')).not.toBeNull();

    const unselected = Array.from(container.querySelectorAll('.piece')).filter(
      (el) => !el.classList.contains('selected'),
    );
    expect(unselected).toHaveLength(1);
  });

  it('renders wall features with placement, clearance, and hover-based remove control', () => {
    const feature = {
      id: 'feature-1',
      type: 'window' as const,
      name: 'Window',
      xIn: 20,
      yIn: 10,
      widthIn: 30,
      heightIn: 20,
      placed: true,
    };
    const { container } = render(
      <WallCanvas
        {...baseProps()}
        autoPlacementSettings={{
          ...autoPlacementSettings,
          wallSetupMode: 'full-wall-with-features',
          wallFeatures: [feature],
        }}
        selectedFeatureId="feature-1"
      />,
    );

    const featureGroup = container.querySelector('.wall-feature.selected');
    expect(featureGroup).not.toBeNull();
    expect(screen.getByLabelText('Return Window to staging')).toBeInTheDocument();
  });

  it('shows the remove control for a selected piece even without hover, so touch users can reach it', () => {
    // Hover has no equivalent on touch — the remove control must also react
    // to selection so a piece selected by tapping isn't stuck unreachable.
    const { container } = render(<WallCanvas {...baseProps()} selectedPieceIds={['piece-1']} />);

    const controls = container.querySelectorAll('.wall-piece-remove-control');
    const selectedControl = screen
      .getByLabelText('Return Sunset to staging')
      .closest('.wall-piece-remove-control');
    const otherControl = screen
      .getByLabelText('Return Mountains to staging')
      .closest('.wall-piece-remove-control');

    expect(controls).toHaveLength(2);
    expect(selectedControl).toHaveClass('is-visible');
    expect(otherControl).not.toHaveClass('is-visible');
  });

  it('shows the remove control for a selected feature even without hover', () => {
    const feature = {
      id: 'feature-1',
      type: 'window' as const,
      name: 'Window',
      xIn: 20,
      yIn: 10,
      widthIn: 30,
      heightIn: 20,
      placed: true,
    };
    render(
      <WallCanvas
        {...baseProps()}
        autoPlacementSettings={{
          ...autoPlacementSettings,
          wallSetupMode: 'full-wall-with-features',
          wallFeatures: [feature],
        }}
        selectedFeatureId="feature-1"
      />,
    );

    const control = screen
      .getByLabelText('Return Window to staging')
      .closest('.wall-piece-remove-control');
    expect(control).toHaveClass('is-visible');
  });

  it('renders a selection marquee rect when one is active', () => {
    render(
      <WallCanvas {...baseProps()} selectionMarquee={{ left: 0, top: 0, right: 20, bottom: 20 }} />,
    );

    expect(screen.getByTestId('selection-marquee')).toBeInTheDocument();
  });

  it('renders alignment guides with x/y testids when present', () => {
    render(
      <WallCanvas
        {...baseProps()}
        alignmentGuides={{
          guides: [
            { axis: 'x', coordinateIn: 10, kind: 'edge' },
            { axis: 'y', coordinateIn: 20, kind: 'center' },
          ],
          isLingering: false,
        }}
      />,
    );

    expect(screen.getByTestId('alignment-guide-x')).toBeInTheDocument();
    expect(screen.getByTestId('alignment-guide-y')).toBeInTheDocument();
  });
});
