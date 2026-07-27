import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EditorFeatures } from '../types';
import { FeatureControls } from './FeatureControls';

const features: EditorFeatures = {
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
};

describe('FeatureControls', () => {
  it('renders the snapping and buffer toggles reflecting current feature state', () => {
    render(
      <FeatureControls
        features={features}
        unit="in"
        onUnitChange={vi.fn()}
        onChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Snap to grid' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Wall edge buffer' })).not.toBeChecked();
  });

  it('reports a toggle change through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FeatureControls
        features={features}
        unit="in"
        onUnitChange={vi.fn()}
        onChange={onChange}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Snap to alignment' }));

    expect(onChange).toHaveBeenCalledWith({ snapToAlignment: false });
  });

  it('disables the wall edge buffer gap field when the buffer is off', () => {
    render(
      <FeatureControls
        features={features}
        unit="in"
        onUnitChange={vi.fn()}
        onChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Wall edge buffer gap (in)')).toBeDisabled();
  });
});
