import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportPanel } from './ExportPanel';

describe('ExportPanel', () => {
  it('disables print exports and lists issues when not ready', () => {
    render(
      <ExportPanel
        ready={false}
        issues={['Add at least one piece to the wall.']}
        exporting={null}
        onExportPng={vi.fn()}
        onExportPdf={vi.fn()}
        onExportJson={vi.fn()}
        onImportClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
    expect(screen.getByText('Add at least one piece to the wall.')).toBeInTheDocument();
  });

  it('enables exports when ready and fires the export callbacks', async () => {
    const user = userEvent.setup();
    const onExportPng = vi.fn();
    const onExportJson = vi.fn();
    render(
      <ExportPanel
        ready={true}
        issues={[]}
        exporting={null}
        onExportPng={onExportPng}
        onExportPdf={vi.fn()}
        onExportJson={onExportJson}
        onImportClick={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(onExportPng).toHaveBeenCalledTimes(1);
    expect(onExportJson).toHaveBeenCalledTimes(1);
  });

  it('marks the exporting button as busy while a print export is in progress', () => {
    render(
      <ExportPanel
        ready={true}
        issues={[]}
        exporting="pdf"
        onExportPng={vi.fn()}
        onExportPdf={vi.fn()}
        onExportJson={vi.fn()}
        onImportClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Export PDF' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
  });
});
