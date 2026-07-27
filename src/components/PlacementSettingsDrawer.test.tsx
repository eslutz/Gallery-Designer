import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AutoPlacementSettings } from '../types';
import { PlacementSettingsDrawer } from './PlacementSettingsDrawer';

const settings: AutoPlacementSettings = {
  wallSetupMode: 'available-sections',
  context: { kind: 'blank', viewingPosture: 'seated' },
  layoutPreference: 'auto',
  wallFeatures: [],
};

describe('PlacementSettingsDrawer', () => {
  it('renders the auto-placement controls and closes via the header button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PlacementSettingsDrawer
        open={true}
        settings={settings}
        selectedFeatureId=""
        unit="in"
        onClose={onClose}
        onSettingsChange={vi.fn()}
        onFeatureSelect={vi.fn()}
        onUnitChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Layout' })).toBeInTheDocument();

    const closeButtons = screen.getAllByRole('button', { name: 'Close auto-placement settings' });
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('applies the is-open class only when open', () => {
    const { container } = render(
      <PlacementSettingsDrawer
        open={false}
        settings={settings}
        selectedFeatureId=""
        unit="in"
        onClose={vi.fn()}
        onSettingsChange={vi.fn()}
        onFeatureSelect={vi.fn()}
        onUnitChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(container.querySelector('.placement-settings-drawer-layer')).not.toHaveClass('is-open');
  });

  it('forwards a settings change from the nested auto-placement controls', async () => {
    const user = userEvent.setup();
    const onSettingsChange = vi.fn();
    render(
      <PlacementSettingsDrawer
        open={true}
        settings={settings}
        selectedFeatureId=""
        unit="in"
        onClose={vi.fn()}
        onSettingsChange={onSettingsChange}
        onFeatureSelect={vi.fn()}
        onUnitChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Layout' }), 'row');

    expect(onSettingsChange).toHaveBeenCalledWith({ ...settings, layoutPreference: 'row' });
  });
});
