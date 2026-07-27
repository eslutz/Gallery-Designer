import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AutoPlacementSettings } from '../types';
import { AutoPlacementControls } from './AutoPlacementControls';

const settings: AutoPlacementSettings = {
  wallSetupMode: 'available-sections',
  context: { kind: 'blank', viewingPosture: 'seated' },
  layoutPreference: 'auto',
  wallFeatures: [],
};

describe('AutoPlacementControls', () => {
  it('renders layout, wall setup, and context selects with current values', () => {
    render(
      <AutoPlacementControls
        settings={settings}
        selectedFeatureId=""
        unit="in"
        onUnitChange={vi.fn()}
        onChange={vi.fn()}
        onFeatureSelect={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveValue('auto');
    expect(screen.getByRole('combobox', { name: 'Wall setup' })).toHaveValue('available-sections');
    expect(screen.queryByLabelText('Furniture and wall features')).toBeNull();
  });

  it('reports a layout change through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AutoPlacementControls
        settings={settings}
        selectedFeatureId=""
        unit="in"
        onUnitChange={vi.fn()}
        onChange={onChange}
        onFeatureSelect={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout' }), 'grid');

    expect(onChange).toHaveBeenCalledWith({ ...settings, layoutPreference: 'grid' });
  });

  it('lists wall features and adds a new one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onFeatureSelect = vi.fn();
    const withFeatures: AutoPlacementSettings = {
      ...settings,
      wallSetupMode: 'full-wall-with-features',
      wallFeatures: [
        { id: 'feature-1', type: 'sofa', name: 'Sofa', xIn: 0, yIn: 0, widthIn: 72, heightIn: 34 },
      ],
    };
    render(
      <AutoPlacementControls
        settings={withFeatures}
        selectedFeatureId=""
        unit="in"
        onUnitChange={vi.fn()}
        onChange={onChange}
        onFeatureSelect={onFeatureSelect}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Feature 1 name')).toHaveTextContent('Sofa');

    await user.click(screen.getByRole('button', { name: 'Add furniture or feature' }));

    expect(onFeatureSelect).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });
});
