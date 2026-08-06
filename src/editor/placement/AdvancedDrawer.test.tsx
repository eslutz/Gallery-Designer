import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EditorFeatures } from '../../types';
import { AdvancedDrawer } from './AdvancedDrawer';

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

function renderDrawer(overrides: Partial<React.ComponentProps<typeof AdvancedDrawer>> = {}) {
  return render(
    <AdvancedDrawer
      open={true}
      themeMode="system"
      applicationTheme="slate"
      features={features}
      unit="in"
      message="Ready to export."
      autoPlacementFailure={null}
      readyToExport={true}
      exportIssues={[]}
      exporting={null}
      onClose={vi.fn()}
      onThemeModeChange={vi.fn()}
      onApplicationThemeChange={vi.fn()}
      onFeaturesChange={vi.fn()}
      onExportPng={vi.fn()}
      onExportPdf={vi.fn()}
      onExportJson={vi.fn()}
      onImportClick={vi.fn()}
      onUnitChange={vi.fn()}
      onEditStart={vi.fn()}
      onEditEnd={vi.fn()}
      {...overrides}
    />,
  );
}

describe('AdvancedDrawer', () => {
  it('shows the latest status message and closes via the header button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDrawer({ onClose });

    expect(screen.getByText('Ready to export.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close Advanced' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape while open, and does nothing while closed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = renderDrawer({ onClose });

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(
      <AdvancedDrawer
        open={false}
        themeMode="system"
        applicationTheme="slate"
        features={features}
        unit="in"
        message="Ready to export."
        autoPlacementFailure={null}
        readyToExport={true}
        exportIssues={[]}
        exporting={null}
        onClose={onClose}
        onThemeModeChange={vi.fn()}
        onApplicationThemeChange={vi.fn()}
        onFeaturesChange={vi.fn()}
        onExportPng={vi.fn()}
        onExportPdf={vi.fn()}
        onExportJson={vi.fn()}
        onImportClick={vi.fn()}
        onUnitChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies the is-open class only when open', () => {
    const { container, rerender } = render(
      <AdvancedDrawer
        open={false}
        themeMode="system"
        applicationTheme="slate"
        features={features}
        unit="in"
        message="Ready to export."
        autoPlacementFailure={null}
        readyToExport={true}
        exportIssues={[]}
        exporting={null}
        onClose={vi.fn()}
        onThemeModeChange={vi.fn()}
        onApplicationThemeChange={vi.fn()}
        onFeaturesChange={vi.fn()}
        onExportPng={vi.fn()}
        onExportPdf={vi.fn()}
        onExportJson={vi.fn()}
        onImportClick={vi.fn()}
        onUnitChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(container.querySelector('.advanced-drawer-layer')).not.toHaveClass('is-open');

    rerender(
      <AdvancedDrawer
        open={true}
        themeMode="system"
        applicationTheme="slate"
        features={features}
        unit="in"
        message="Ready to export."
        autoPlacementFailure={null}
        readyToExport={true}
        exportIssues={[]}
        exporting={null}
        onClose={vi.fn()}
        onThemeModeChange={vi.fn()}
        onApplicationThemeChange={vi.fn()}
        onFeaturesChange={vi.fn()}
        onExportPng={vi.fn()}
        onExportPdf={vi.fn()}
        onExportJson={vi.fn()}
        onImportClick={vi.fn()}
        onUnitChange={vi.fn()}
        onEditStart={vi.fn()}
        onEditEnd={vi.fn()}
      />,
    );

    expect(container.querySelector('.advanced-drawer-layer')).toHaveClass('is-open');
  });

  it('reports a theme mode change', async () => {
    const user = userEvent.setup();
    const onThemeModeChange = vi.fn();
    renderDrawer({ onThemeModeChange });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Appearance' }), 'dark');

    expect(onThemeModeChange).toHaveBeenCalledWith('dark');
  });
});
