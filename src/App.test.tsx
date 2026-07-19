import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const exportMocks = vi.hoisted(() => ({
  downloadPng: vi.fn(),
  downloadPdf: vi.fn(),
  downloadSvgAsPng: vi.fn(),
}));

vi.mock('./lib/exportDesign', async () => {
  const actual = await vi.importActual<typeof import('./lib/exportDesign')>('./lib/exportDesign');
  return { ...actual, ...exportMocks };
});

describe('Gallery Designer app', () => {
  beforeEach(() => {
    exportMocks.downloadPng.mockReset().mockResolvedValue(undefined);
    exportMocks.downloadPdf.mockReset().mockResolvedValue(undefined);
    exportMocks.downloadSvgAsPng.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.style.colorScheme = '';
    document.body.classList.remove('suppress-text-selection');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    window.matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: query.includes('prefers-color-scheme: dark'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
  });

  it('creates a multi-section wall, adds pieces, auto-places them, and shows export-ready measurements', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: /Gallery Designer/i })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Section 1 width'));
    await user.type(screen.getByLabelText('Section 1 width'), '120');
    await user.clear(screen.getByLabelText('Section 1 height'));
    await user.type(screen.getByLabelText('Section 1 height'), '96');
    await user.click(screen.getByRole('button', { name: /Add wall section/i }));
    await user.clear(screen.getByLabelText('Section 2 width'));
    await user.type(screen.getByLabelText('Section 2 width'), '72');
    await user.clear(screen.getByLabelText('Section 2 height'));
    await user.type(screen.getByLabelText('Section 2 height'), '96');

    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    const table = screen.getByRole('table', { name: /Installation measurements/i });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeEnabled();
  });

  it('shows PNG export progress and prevents concurrent print exports', async () => {
    const user = userEvent.setup();
    let finishExport: (() => void) | undefined;
    exportMocks.downloadPng.mockReturnValue(
      new Promise<void>((resolve) => {
        finishExport = resolve;
      }),
    );
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    await user.click(screen.getByRole('button', { name: /Export PNG/i }));

    expect(exportMocks.downloadPng).toHaveBeenCalledTimes(1);
    expect(exportMocks.downloadPng).toHaveBeenCalledWith(
      expect.objectContaining({
        autoPlacementSettings: expect.objectContaining({
          wallSetupMode: expect.any(String),
          wallFeatures: expect.any(Array),
        }),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Exporting PNG');
    expect(screen.getByRole('button', { name: /Export PNG/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeDisabled();

    finishExport?.();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('PNG export generated'),
    );
    expect(screen.getByRole('button', { name: /Export PNG/i })).toBeEnabled();
  });

  it('reports PDF export failures and restores the export buttons', async () => {
    const user = userEvent.setup();
    exportMocks.downloadPdf.mockRejectedValue(new Error('PDF generation failed.'));
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    await user.click(screen.getByRole('button', { name: /Export PDF/i }));

    expect(exportMocks.downloadPdf).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'PDF export failed: PDF generation failed.',
      ),
    );
    expect(screen.getByRole('button', { name: /Export PNG/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Export PDF/i })).toBeEnabled();
  });

  it('renders the theme-responsive logo decoratively in the header', () => {
    const { container } = render(<App />);

    const logo = container.querySelector<SVGSVGElement>('.brand-logo');
    expect(logo).toBeInTheDocument();
  });

  it('marks the root element with the slate palette by default and does not show a theme badge', () => {
    render(<App />);

    expect(document.documentElement).toHaveAttribute('data-palette', 'slate');
    expect(screen.queryByText(/application theme preview/i)).not.toBeInTheDocument();
  });

  it('uses a staging tray for unplaced pieces and no longer renders a place-on-first-wall action', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('region', { name: /Art staging tray/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Inspector/i })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /Details and export/i })).toContainElement(
      screen.getByRole('heading', { name: /^Export$/i }),
    );
    expect(screen.getByRole('complementary', { name: /Details and export/i })).toContainElement(
      screen.getByRole('heading', { name: /Features/i }),
    );
    expect(screen.getByRole('complementary', { name: /Details and export/i })).toContainElement(
      screen.getByRole('heading', { name: /Auto-placement/i }),
    );
    expect(screen.queryByRole('button', { name: /Place on first wall/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add art piece/i }));

    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drag Piece 2 from staging/i })).toBeInTheDocument();
  });

  it('explains feature behavior without extra local persistence copy', () => {
    render(<App />);

    expect(screen.queryByText(/saved locally in this browser/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/snap settings apply while dragging or nudging pieces/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Art piece buffer information' })).toHaveAttribute(
      'aria-describedby',
    );
    expect(
      screen.queryByText(/buffer guides reserve installation clearance/i),
    ).not.toBeInTheDocument();
  });

  it('explains context and viewing height for available wall sections', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /context information/i })).toHaveAttribute(
      'aria-describedby',
    );
    expect(screen.getByRole('button', { name: /viewing height information/i })).toHaveAttribute(
      'aria-describedby',
    );
    expect(screen.getAllByRole('tooltip')[0]).toHaveTextContent(
      /context sets placement priorities/i,
    );
    expect(screen.getAllByRole('tooltip')[1]).toHaveTextContent(/shifts the group vertically/i);
  });

  it('shows and hides info tooltips from hover, focus, and Escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    const button = screen.getByRole('button', { name: 'Snap to alignment information' });
    const tooltip = document.getElementById(button.getAttribute('aria-describedby') ?? '');

    expect(tooltip).toHaveClass('info-tooltip');
    expect(tooltip).not.toHaveClass('info-tooltip-open');

    await user.hover(button);
    await waitFor(() => expect(tooltip).toHaveClass('info-tooltip-open'));

    await user.unhover(button);
    await waitFor(() => expect(tooltip).not.toHaveClass('info-tooltip-open'));

    fireEvent.focus(button);
    await waitFor(() => expect(tooltip).toHaveClass('info-tooltip-open'));

    fireEvent.keyDown(button, { key: 'Escape' });
    await waitFor(() => expect(tooltip).not.toHaveClass('info-tooltip-open'));
  });

  it('positions info tooltips inside a narrow viewport', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    render(<App />);

    const button = screen.getByRole('button', { name: 'Snap to alignment information' });
    const tooltip = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(tooltip).not.toBeNull();

    button.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 376,
          top: 120,
          width: 18,
          height: 18,
          right: 394,
          bottom: 138,
          x: 376,
          y: 120,
          toJSON: vi.fn(),
        }) as DOMRect,
    );
    tooltip!.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          width: 240,
          height: 96,
          right: 240,
          bottom: 96,
          x: 0,
          y: 0,
          toJSON: vi.fn(),
        }) as DOMRect,
    );

    await user.hover(button);

    await waitFor(() => expect(Number.parseFloat(tooltip!.style.left)).toBe(142));
    expect(Number.parseFloat(tooltip!.style.left)).toBeGreaterThanOrEqual(8);
    expect(
      Number.parseFloat(tooltip!.style.left) + Number.parseFloat(tooltip!.style.maxWidth),
    ).toBeLessThanOrEqual(382);
    expect(Number.parseFloat(tooltip!.style.top)).toBeGreaterThanOrEqual(8);
  });

  it('uses full-wall feature settings when placing pieces', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Wall setup'), 'full-wall-with-features');
    await user.click(screen.getByRole('button', { name: /Add furniture or feature/i }));
    await user.selectOptions(screen.getByLabelText('Feature 1 type'), 'sofa');
    await user.clear(screen.getByLabelText('Feature 1 width (in)'));
    await user.type(screen.getByLabelText('Feature 1 width (in)'), '72');
    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/full wall/i);
  });

  it('stages new furniture and feature items in full-wall mode without a left-edge field', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Wall setup'), 'full-wall-with-features');
    await user.click(screen.getByRole('button', { name: /Add furniture or feature/i }));

    expect(screen.queryByLabelText('Feature 1 left edge (in)')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Drag Wall feature 1 from staging/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'File cabinet' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Lamp' })).toBeInTheDocument();
  });

  it('moves furniture and features from staging to the wall and back to staging', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Wall setup'), 'full-wall-with-features');
    await user.click(screen.getByRole('button', { name: /Add furniture or feature/i }));
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    mockPointerTarget(canvas);

    const stagedFeature = screen.getByRole('button', { name: /Drag Wall feature 1 from staging/i });
    act(() => {
      fireEvent.pointerDown(stagedFeature, { pointerId: 1, clientX: 50, clientY: 50 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 60, clientY: 60 }));
    });

    const placedFeature = screen.getByRole('button', { name: /Move Wall feature 1/i });
    expect(placedFeature).toBeInTheDocument();

    const stagingTray = screen.getByRole('region', { name: /Art staging tray/i });
    mockPointerTarget(stagingTray);
    act(() => {
      placedFeature.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 60,
          clientY: 60,
        }),
      );
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 200 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 20, clientY: 200 }));
    });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Drag Wall feature 1 from staging/i }),
      ).toBeInTheDocument(),
    );
  });

  it('keeps manually placed art fixed while auto-placing the remaining pieces and supports undo', async () => {
    const user = userEvent.setup();
    render(<App />);

    placeStagedPieceOnWall();
    const fixedPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const fixedX = fixedPiece.getAttribute('x');
    const fixedY = fixedPiece.getAttribute('y');
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toHaveAttribute('x', fixedX);
    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toHaveAttribute('y', fixedY);
    expect(screen.getByRole('button', { name: /^Move Piece 2$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Move Piece 3$/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      /placed 2 remaining pieces around 1 piece you positioned/i,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Existing pieces were not moved/i);

    await user.click(screen.getByRole('button', { name: /Undo last change/i }));

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toHaveAttribute('x', fixedX);
    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toHaveAttribute('y', fixedY);
    expect(screen.getByRole('button', { name: /Drag Piece 2 from staging/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drag Piece 3 from staging/i })).toBeInTheDocument();
  });

  it('makes auto-placement a no-op when all art is already placed', async () => {
    const user = userEvent.setup();
    render(<App />);
    placeStagedPieceOnWall();
    const undo = screen.getByRole('button', { name: /Undo last change/i });
    expect(undo).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/All art pieces are already placed/i);
    expect(screen.getByRole('status')).toHaveTextContent(/made no changes/i);
    expect(undo).toBeEnabled();
  });

  it('explains invalid existing placements before auto-placement', async () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        sections: [{ id: 'main', name: 'Main', widthIn: 96, heightIn: 84, cornerAfter: 'none' }],
        pieces: [
          { id: 'outside', label: 'Outside', widthIn: 16, heightIn: 20 },
          { id: 'remaining', label: 'Remaining', widthIn: 12, heightIn: 12 },
        ],
        placements: [{ pieceId: 'outside', sectionId: 'main', xIn: 90, yIn: 20 }],
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/existing placements need attention/i);
    expect(screen.getByRole('status')).toHaveTextContent(
      /Outside extends beyond the wall boundary/i,
    );
    expect(
      screen.getByRole('button', { name: /Drag Remaining from staging/i }),
    ).toBeInTheDocument();
  });

  it('reports fixed and remaining counts when partial auto-placement fails', async () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        sections: [{ id: 'small', name: 'Small', widthIn: 40, heightIn: 30, cornerAfter: 'none' }],
        pieces: [
          { id: 'fixed', label: 'Fixed', widthIn: 12, heightIn: 12 },
          { id: 'two', label: 'Two', widthIn: 13, heightIn: 13 },
          { id: 'three', label: 'Three', widthIn: 13, heightIn: 13 },
        ],
        placements: [{ pieceId: 'fixed', sectionId: 'small', xIn: 5, yIn: 5 }],
      }),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/Kept 1 placed piece in position/i);
    expect(screen.getByRole('status')).toHaveTextContent(/2 remaining pieces/i);
    expect(screen.getByRole('button', { name: /Drag Two from staging/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drag Three from staging/i })).toBeInTheDocument();
  });

  it('explains the spacing, margin, and attempted strategies after auto-placement fails', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Section 1 width'));
    await user.type(screen.getByLabelText('Section 1 width'), '40');
    await user.clear(screen.getByLabelText('Section 1 height'));
    await user.type(screen.getByLabelText('Section 1 height'), '30');
    await user.clear(screen.getByLabelText('Piece 1 width'));
    await user.type(screen.getByLabelText('Piece 1 width'), '12');
    await user.clear(screen.getByLabelText('Piece 1 height'));
    await user.type(screen.getByLabelText('Piece 1 height'), '12');
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    await user.clear(screen.getByLabelText('Piece 2 width'));
    await user.type(screen.getByLabelText('Piece 2 width'), '13');
    await user.clear(screen.getByLabelText('Piece 2 height'));
    await user.type(screen.getByLabelText('Piece 2 height'), '12');
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    await user.clear(screen.getByLabelText('Piece 3 width'));
    await user.type(screen.getByLabelText('Piece 3 width'), '12');
    await user.clear(screen.getByLabelText('Piece 3 height'));
    await user.type(screen.getByLabelText('Piece 3 height'), '13');

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/2 in spacing/i);
    expect(status).toHaveTextContent(/5 in wall margin/i);
    expect(within(status).getByText(/Row:/i).closest('li')).toHaveTextContent(/wider/i);
    expect(
      within(status)
        .getByText(/Packed:/i)
        .closest('li'),
    ).toHaveTextContent(/could not place every piece/i);
  });

  it('does not render manual wall section position fields', () => {
    render(<App />);

    expect(screen.queryByLabelText('Section 1 X position')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Section 1 Y position')).not.toBeInTheDocument();
  });

  it('keeps exterior edge keys unique when the wall has multiple sections', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<App />);
    await user.click(screen.getByRole('button', { name: /Add wall section/i }));

    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes('Encountered two children with the same key'),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it('shows staged art pieces at their scaled proportions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText('Piece 1 width'));
    await user.type(screen.getByLabelText('Piece 1 width'), '10');
    await user.clear(screen.getByLabelText('Piece 1 height'));
    await user.type(screen.getByLabelText('Piece 1 height'), '20');
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    await user.clear(screen.getByLabelText('Piece 2 width'));
    await user.type(screen.getByLabelText('Piece 2 width'), '30');
    await user.clear(screen.getByLabelText('Piece 2 height'));
    await user.type(screen.getByLabelText('Piece 2 height'), '10');

    const portrait = screen.getByRole('button', { name: /Drag Piece 1 from staging/i });
    const landscape = screen.getByRole('button', { name: /Drag Piece 2 from staging/i });

    const portraitPreview = within(portrait).getByTestId('staged-piece-preview');
    const landscapePreview = within(landscape).getByTestId('staged-piece-preview');

    expect(portraitPreview).toHaveStyle({ width: '40px', height: '80px' });
    expect(landscapePreview).toHaveStyle({ width: '120px', height: '40px' });
    expect(within(portrait).getByText('Piece 1')).toHaveClass('staged-piece-name');
    expect(within(portrait).getByText('10 in x 20 in')).toHaveClass('staged-piece-size');
  });

  it('uses the rendered wall-scale pointer preview for staged and wall pieces', () => {
    render(<App />);

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    Object.defineProperty(canvas, 'viewBox', {
      configurable: true,
      value: { baseVal: { width: 124, height: 122 } },
    });
    canvas.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 248,
          height: 244,
          x: 0,
          y: 0,
          top: 0,
          right: 248,
          bottom: 244,
          left: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    mockCanvasProjection(canvas);
    mockPointerTarget(canvas);

    const stagedPiece = screen.getByRole('button', { name: /Drag Piece 1 from staging/i });
    fireEvent.pointerDown(stagedPiece, { pointerId: 1, clientX: 0, clientY: 0 });
    const stagedPreview = screen.getByTestId('wall-drag-preview');
    expect(stagedPreview).toHaveStyle({ width: '32px', height: '40px' });
    expect(document.body).toHaveClass('suppress-text-selection');
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(document.body).not.toHaveClass('suppress-text-selection');

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).not.toHaveAttribute(
      'draggable',
    );
  });

  it('keeps a staged-piece drop aligned to the same snapped grid position shown by the preview', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Grid size (in)'), { target: { value: '10' } });
    placeStagedPieceOnWall();

    const placedPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const placedX = Number(placedPiece.getAttribute('x'));
    const placedY = Number(placedPiece.getAttribute('y'));
    expect(Math.abs(placedX % 10)).toBe(0);
    expect(Math.abs(placedY % 10)).toBe(0);
  });

  it('makes wall pieces browser-focusable', () => {
    render(<App />);

    placeStagedPieceOnWall();

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('activates and nudges canvas controls from the keyboard', () => {
    render(<App />);

    const section = screen.getByRole('button', { name: /^Move Section 1$/i });
    fireEvent.keyDown(section, { key: 'Enter' });
    expect(section.closest('.wall-section')).toHaveClass('selected');

    placeStagedPieceOnWall();
    const piece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const startX = Number(piece.getAttribute('x'));
    fireEvent.keyDown(piece, { key: 'ArrowRight' });
    expect(Number(piece.getAttribute('x'))).toBe(startX + 0.25);
    expect(piece).toHaveAttribute('aria-pressed', 'true');
  });

  it('nudges a selected placed art piece with arrow keys outside the canvas focus target', () => {
    render(<App />);

    placeStagedPieceOnWall();

    const piece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const startX = Number(piece.getAttribute('x'));
    const startY = Number(piece.getAttribute('y'));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });

    expect(Number(piece.getAttribute('x'))).toBe(startX + 0.25);
    expect(Number(piece.getAttribute('y'))).toBe(startY + 1);
  });

  it('clears furniture selection when selecting art on the wall', () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        sections: [
          {
            id: 'section-1',
            name: 'Section 1',
            widthIn: 100,
            heightIn: 80,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [{ id: 'poster', label: 'Poster', widthIn: 20, heightIn: 20 }],
        placements: [{ pieceId: 'poster', sectionId: 'section-1', xIn: 20, yIn: 20 }],
        autoPlacementSettings: {
          wallSetupMode: 'full-wall-with-features',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [
            {
              id: 'cabinet',
              type: 'file-cabinet',
              name: 'File Cabinet',
              xIn: 38,
              yIn: 28,
              widthIn: 24,
              heightIn: 30,
              placed: true,
            },
          ],
        },
      }),
    );
    render(<App />);

    const cabinet = screen.getByRole('button', { name: /^Move File Cabinet$/i });
    const poster = screen.getByRole('button', { name: /^Move Poster$/i });
    fireEvent.keyDown(cabinet, { key: 'Enter' });
    expect(cabinet).toHaveAttribute('aria-pressed', 'true');

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    act(() => {
      poster.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 30, clientY: 30 }),
      );
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 30, clientY: 30 }));
    });

    expect(cabinet).toHaveAttribute('aria-pressed', 'false');
    expect(poster).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(poster).toHaveAttribute('x', '20.25');
    expect(cabinet).toHaveAttribute('x', '38');
  });

  it('does not nudge a piece while editing a form field', () => {
    render(<App />);

    placeStagedPieceOnWall();

    const piece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const startX = piece.getAttribute('x');
    fireEvent.keyDown(screen.getByLabelText('Piece 1 width'), { key: 'ArrowRight' });

    expect(piece).toHaveAttribute('x', startX ?? '');
  });

  it('does not let section focus trigger the selected piece nudge handler', () => {
    render(<App />);

    placeStagedPieceOnWall();
    const piece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const section = screen.getByRole('button', { name: /^Move Section 1$/i });
    const startX = piece.getAttribute('x');

    fireEvent.keyDown(section, { key: 'ArrowRight' });

    expect(piece).toHaveAttribute('x', startX ?? '');
  });

  it('standardizes cursor affordances for draggable objects and pannable canvas space', () => {
    render(<App />);

    const appShell = document.querySelector('.app-shell');
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    const panSurface = canvas.querySelector('.wall-pan-surface');
    const section = screen.getByRole('button', { name: /^Move Section 1$/i });
    const stagedPiece = screen.getByRole('button', { name: /Drag Piece 1 from staging/i });

    expect(appShell).not.toHaveClass('is-wall-pannable');
    expect(section).toHaveClass('wall-section');
    expect(stagedPiece).toHaveClass('staged-piece');

    fireEvent.pointerDown(panSurface as Element, { pointerId: 1, clientX: 20, clientY: 20 });
    expect(appShell).not.toHaveClass('is-panning-wall');

    fireEvent.click(screen.getByRole('button', { name: /Zoom in/i }));

    expect(appShell).toHaveClass('is-wall-pannable');
  });

  it('keeps drag cursor state active until pointer release', () => {
    render(<App />);

    const appShell = document.querySelector('.app-shell');
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    const stagedPiece = screen.getByRole('button', { name: /Drag Piece 1 from staging/i });

    fireEvent.pointerDown(stagedPiece, { pointerId: 1, clientX: 20, clientY: 20 });
    expect(appShell).toHaveClass('is-dragging-piece');
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 20, clientY: 20 });
    expect(appShell).not.toHaveClass('is-dragging-piece');

    mockCanvasProjection(canvas);
    const section = screen.getByRole('button', { name: /^Move Section 1$/i });
    act(() => {
      section.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }),
      );
    });
    expect(appShell).toHaveClass('is-dragging-section');
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 0, clientY: 0 });
    expect(appShell).not.toHaveClass('is-dragging-section');
  });

  it('drags stepped wall sections from their rendered position while zoomed in', async () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        sections: [
          {
            id: 'section-1',
            name: 'Section 1',
            widthIn: 79,
            heightIn: 60,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
          {
            id: 'section-2',
            name: 'Section 2',
            widthIn: 59,
            heightIn: 36,
            cornerAfter: 'none',
            xIn: 79,
            yIn: 0,
          },
        ],
        pieces: [{ id: 'piece-1', label: 'Piece 1', widthIn: 16, heightIn: 20 }],
        placements: [],
      }),
    );
    render(<App />);

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });

    const section2 = screen.getByRole('button', { name: /^Move Section 2$/i });
    expect(section2).toHaveAttribute('x', '79');
    expect(section2).toHaveAttribute('y', '0');

    fireEvent.click(screen.getByRole('button', { name: /Zoom in/i }));
    mockCanvasProjection(canvas);
    const zoomedSection2 = screen.getByRole('button', { name: /^Move Section 2$/i });
    act(() => {
      zoomedSection2.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 79, clientY: 1 }),
      );
    });
    expect(screen.getByRole('button', { name: /^Move Section 2$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 61 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 20, clientY: 61 }));
    });

    const movedSection2 = screen.getByRole('button', { name: /^Move Section 2$/i });
    expect(movedSection2).toHaveAttribute('x', '20');
    expect(movedSection2).toHaveAttribute('y', '60');
  });

  it('keeps stale-section art visually fixed when moving a different section', () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [
          {
            id: 'left',
            name: 'Section 1',
            widthIn: 80,
            heightIn: 60,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
          {
            id: 'right',
            name: 'Section 2',
            widthIn: 80,
            heightIn: 60,
            cornerAfter: 'none',
            xIn: 200,
            yIn: 0,
          },
        ],
        pieces: [{ id: 'poster', label: 'Poster', widthIn: 20, heightIn: 20 }],
        placements: [{ pieceId: 'poster', sectionId: 'right', xIn: -190, yIn: 10 }],
        features: {
          snapToGrid: false,
          gridSizeIn: 1,
          snapToAlignment: false,
          alignmentToleranceIn: 1,
          wallEdgeBuffer: false,
          wallEdgeBufferGapIn: 2,
          artPieceBuffer: false,
          artPieceBufferGapIn: 2,
          measurementReferenceMode: 'relative',
        },
        autoPlacementSettings: {
          wallSetupMode: 'available-sections',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [],
        },
        selectedPieceId: 'poster',
        message: '',
      }),
    );
    render(<App />);

    const poster = screen.getByRole('button', { name: /^Move Poster$/i });
    expect(poster).toHaveAttribute('x', '10');

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    act(() => {
      screen
        .getByRole('button', { name: /^Move Section 2$/i })
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 0 }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 0 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 250, clientY: 0 }));
    });

    expect(screen.getByRole('button', { name: /^Move Poster$/i })).toHaveAttribute('x', '10');
  });

  it('moves placed furniture with the wall section that contains it', () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        sections: [
          {
            id: 'section-1',
            name: 'Section 1',
            widthIn: 100,
            heightIn: 80,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [],
        placements: [],
        autoPlacementSettings: {
          wallSetupMode: 'full-wall-with-features',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [
            {
              id: 'cabinet',
              type: 'file-cabinet',
              name: 'File Cabinet',
              xIn: 20,
              yIn: 28,
              widthIn: 24,
              heightIn: 30,
              placed: true,
            },
          ],
        },
      }),
    );
    render(<App />);

    const section = screen.getByRole('button', { name: /^Move Section 1$/i });
    const cabinet = screen.getByRole('button', { name: /^Move File Cabinet$/i });
    expect(cabinet).toHaveAttribute('x', '20');
    expect(cabinet).toHaveAttribute('y', '28');

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    act(() => {
      section.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }),
      );
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 12, clientY: 8 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 12, clientY: 8 }));
    });

    expect(section).toHaveAttribute('x', '12');
    expect(section).toHaveAttribute('y', '8');
    expect(cabinet).toHaveAttribute('x', '32');
    expect(cabinet).toHaveAttribute('y', '36');

    fireEvent.keyDown(section, { key: 'ArrowRight', shiftKey: true });

    expect(section).toHaveAttribute('x', '13');
    expect(cabinet).toHaveAttribute('x', '33');
    expect(cabinet).toHaveAttribute('y', '36');
  });

  it('nudges furniture horizontally even when it starts on an alignment guide', () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        sections: [
          {
            id: 'section-1',
            name: 'Section 1',
            widthIn: 100,
            heightIn: 80,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [],
        placements: [],
        autoPlacementSettings: {
          wallSetupMode: 'full-wall-with-features',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [
            {
              id: 'cabinet',
              type: 'file-cabinet',
              name: 'File Cabinet',
              xIn: 38,
              yIn: 28,
              widthIn: 24,
              heightIn: 30,
              placed: true,
            },
          ],
        },
      }),
    );
    render(<App />);

    const cabinet = screen.getByRole('button', { name: /^Move File Cabinet$/i });
    fireEvent.keyDown(cabinet, { key: 'ArrowRight' });
    expect(cabinet).toHaveAttribute('x', '38.25');

    fireEvent.keyDown(cabinet, { key: 'ArrowLeft' });
    expect(cabinet).toHaveAttribute('x', '38');

    fireEvent.keyDown(cabinet, { key: 'ArrowDown' });
    expect(cabinet).toHaveAttribute('y', '28.25');

    fireEvent.keyDown(cabinet, { key: 'ArrowUp' });
    expect(cabinet).toHaveAttribute('y', '28');
  });

  it('falls back safely when persisted state contains invalid arrays', () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({ sections: [], pieces: [], placements: null }),
    );

    expect(() => render(<App />)).not.toThrow();
    expect(screen.getByLabelText('Section 1 name')).toBeInTheDocument();
  });

  it('keeps editing available when browser persistence is unavailable', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    expect(() => render(<App />)).not.toThrow();
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    expect(screen.getByLabelText('Piece 2 label')).toBeInTheDocument();
    setItem.mockRestore();
  });

  it('moves pieces from staging to the wall and back to staging with drag and pointer drop', () => {
    render(<App />);

    placeStagedPieceOnWall();

    expect(
      screen.queryByRole('button', { name: /Drag Piece 1 from staging/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export PNG/i })).toBeEnabled();

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          inverse: () => ({
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: 0,
            f: 0,
          }),
        }) as DOMMatrix,
    );
    const stagingTray = screen.getByRole('region', { name: /Art staging tray/i });
    const elementFromPoint = vi.fn(() => stagingTray);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });
    const wallPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });

    startWallPieceDrag(wallPiece, 20, 20);
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 20, clientY: 200 }));
    });

    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move Piece 1$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Piece 1 has not been placed/i)).toBeInTheDocument();
  });

  it('prevents native text selection while a wall-piece drag leaves the canvas', () => {
    render(<App />);

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    placeStagedPieceOnWall();
    mockCanvasProjection(canvas);

    startWallPieceDrag(screen.getByRole('button', { name: /^Move Piece 1$/i }), 20, 20);
    const pointerMove = new Event('pointermove', { cancelable: true });
    window.dispatchEvent(pointerMove);

    expect(pointerMove.defaultPrevented).toBe(true);
  });

  it('keeps a newly placed piece selected after its next pointer pick-up', () => {
    render(<App />);

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    placeStagedPieceOnWall();
    mockCanvasProjection(canvas);

    const wallPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    startWallPieceDrag(wallPiece, 20, 20);
    expect(screen.getByTestId('wall-drag-preview')).toBeInTheDocument();
    fireEvent.click(wallPiece);

    expect(wallPiece.closest('g')).toHaveClass('selected');
  });

  it('places a staged piece with pointer drag and immediately starts the next wall-piece drag', () => {
    render(<App />);

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        }) as DOMMatrix,
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => canvas),
    });

    const stagedPiece = screen.getByRole('button', { name: /Drag Piece 1 from staging/i });
    act(() => {
      fireEvent.pointerDown(stagedPiece, { pointerId: 1, clientX: 20, clientY: 120 });
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 60, clientY: 60 }));
    });

    const wallPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    expect(wallPiece.closest('g')).toHaveClass('selected');

    startWallPieceDrag(wallPiece, 60, 60);

    expect(screen.getByTestId('wall-drag-preview')).toBeInTheDocument();
    expect(document.body).toHaveClass('suppress-text-selection');
  });

  it('allows decimal piece sizes while typing', async () => {
    const user = userEvent.setup();
    render(<App />);

    const width = screen.getByLabelText('Piece 1 width');
    await user.clear(width);
    await user.type(width, '12.5');

    expect(width).toHaveValue('12.5');
  });

  it('undoes adding an art piece', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Add art piece/i }));

    expect(screen.getByLabelText('Piece 2 label')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Undo last change/i }));

    expect(screen.queryByLabelText('Piece 2 label')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Restored the previous change/i);
  });

  it('undoes a completed field edit as one change', async () => {
    const user = userEvent.setup();
    render(<App />);

    const width = screen.getByLabelText('Piece 1 width');
    await user.clear(width);
    await user.type(width, '12.5');
    await user.tab();

    expect(width).toHaveValue('12.5');

    await user.click(screen.getByRole('button', { name: /Undo last change/i }));

    expect(screen.getByLabelText('Piece 1 width')).toHaveValue('16');
  });

  it('undoes manually placing art from the staging tray', async () => {
    const user = userEvent.setup();
    render(<App />);

    placeStagedPieceOnWall();

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Undo last change/i }));

    expect(screen.queryByRole('button', { name: /^Move Piece 1$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
  });

  it('clears placed art from the Clear menu by returning all pieces to the staging tray', async () => {
    const user = userEvent.setup();
    render(<App />);

    placeStagedPieceOnWall();

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear/i }));
    await user.click(screen.getByRole('menuitem', { name: /Clear placed art/i }));

    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move Piece 1$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Piece 1 has not been placed/i)).toBeInTheDocument();
  });

  it('lets users undo clearing placed art', async () => {
    const user = userEvent.setup();
    render(<App />);

    placeStagedPieceOnWall();
    await user.click(screen.getByRole('button', { name: /Clear/i }));
    await user.click(screen.getByRole('menuitem', { name: /Clear placed art/i }));
    await user.click(screen.getByRole('button', { name: /Undo last change/i }));

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Restored the previous change/i);
  });

  it('clears wall sections without removing art pieces', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Add wall section/i }));
    expect(screen.getByLabelText('Section 2 width')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear/i }));
    await user.click(screen.getByRole('menuitem', { name: /Clear wall sections/i }));

    expect(screen.queryByLabelText('Section 1 width')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Piece 1 label')).toHaveValue('Piece 1');
    expect(screen.getByRole('alert')).toHaveTextContent(/Add at least one wall section/i);
  });

  it('resets the entire design after confirmation', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await user.clear(screen.getByLabelText('Piece 1 label'));
    await user.type(screen.getByLabelText('Piece 1 label'), 'Custom Piece');
    await user.click(screen.getByRole('button', { name: /Add wall section/i }));
    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    placeStagedPieceOnWall(/Drag Custom Piece from staging/i);

    await user.click(screen.getByRole('button', { name: /Clear/i }));
    await user.click(screen.getByRole('menuitem', { name: /Reset entire design/i }));

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/reset the entire design/i));
    expect(screen.queryByLabelText('Section 1 width')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Section 2 width')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Piece 1 label')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Piece 2 label')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move Custom Piece$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Add at least one wall section/i);

    confirm.mockRestore();
  });

  it('shows furniture and feature clearing only in full-wall mode', async () => {
    const user = userEvent.setup();
    render(<App />);

    placeStagedPieceOnWall();
    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear/i }));
    expect(
      screen.queryByRole('menuitem', { name: /Clear furniture & features/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear/i }));

    await user.selectOptions(screen.getByLabelText('Wall setup'), 'full-wall-with-features');
    await user.click(screen.getByRole('button', { name: /Add furniture or feature/i }));
    expect(screen.getByLabelText('Feature 1 type')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear/i }));
    await user.click(screen.getByRole('menuitem', { name: /Clear furniture & features/i }));

    expect(screen.queryByLabelText('Feature 1 type')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toBeInTheDocument();
  });

  it('closes the clear menu when clicking outside it', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Clear/i }));
    expect(screen.getByRole('menu', { name: /Clear options/i })).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole('menu', { name: /Clear options/i })).not.toBeInTheDocument();
  });

  it('explains an empty measurements table before any placement', () => {
    render(<App />);

    expect(
      screen.getByText(/Place a piece on the wall to see installation measurements/i),
    ).toBeInTheDocument();
  });

  it('shows configurable snapping features', async () => {
    const user = userEvent.setup();
    render(<App />);

    const detailsPanel = screen.getByRole('complementary', { name: /Details and export/i });
    expect(within(detailsPanel).getByRole('heading', { name: /Features/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary', { name: /Setup controls/i })).queryByRole(
        'heading',
        { name: /Features/i },
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Snap to grid')).toBeChecked();
    expect(screen.getByLabelText('Snap to alignment')).toBeChecked();
    expect(screen.getByLabelText('Show alignment guides')).toBeChecked();
    expect(screen.getByLabelText('Wall edge buffer')).not.toBeChecked();
    expect(screen.getByLabelText('Art piece buffer')).not.toBeChecked();
    expect(screen.getByLabelText('Grid size (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Alignment tolerance (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Wall edge buffer gap (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Art piece buffer gap (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Wall edge buffer gap (in)')).toBeDisabled();
    expect(screen.getByLabelText('Art piece buffer gap (in)')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Snap to grid information' }),
    ).toHaveAccessibleDescription(/dragging or nudging.*grid size is the increment/i);
    expect(
      screen.queryByRole('button', { name: 'Grid size (in) information' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Snap to alignment information' }),
    ).toHaveAccessibleDescription(/nearby artwork and wall alignment.*how close/i);
    expect(
      screen.getByRole('button', { name: 'Show alignment guides information' }),
    ).toHaveAccessibleDescription(/dotted guide lines.*snapping engages/i);
    expect(
      screen.queryByRole('button', { name: 'Alignment tolerance (in) information' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Wall edge buffer information' }),
    ).toHaveAccessibleDescription(/clearance from wall edges.*clearance distance/i);
    expect(
      screen.queryByRole('button', { name: 'Wall edge buffer gap (in) information' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Art piece buffer information' }),
    ).toHaveAccessibleDescription(/spacing between artwork.*spacing distance/i);
    expect(
      screen.queryByRole('button', { name: 'Art piece buffer gap (in) information' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use absolute installation measurements information' }),
    ).toHaveAccessibleDescription(/relative.*absolute.*top-left origin/i);
    expect(
      screen.queryByText(/Buffer guides reserve installation clearance around walls and artwork/i),
    ).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByText(/Absolute measurements use the continuous wall's top-left origin/i)
        .some((element) => element.closest('.feature-help')),
    ).toBe(false);

    await user.click(screen.getByLabelText('Show alignment guides'));
    expect(screen.getByLabelText('Show alignment guides')).not.toBeChecked();

    await user.clear(screen.getByLabelText('Grid size (in)'));
    await user.type(screen.getByLabelText('Grid size (in)'), '2.5');

    expect(screen.getByLabelText('Grid size (in)')).toHaveValue('2.5');

    await user.selectOptions(screen.getByLabelText('Units'), 'cm');
    expect(screen.getByLabelText('Grid size (cm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Alignment tolerance (cm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Wall edge buffer gap (cm)')).toHaveValue('5.1');
    expect(screen.getByLabelText('Art piece buffer gap (cm)')).toHaveValue('5.1');
    expect(
      screen.queryByRole('button', { name: 'Grid size (cm) information' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Alignment tolerance (cm) information' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Wall edge buffer gap (cm) information' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Art piece buffer gap (cm) information' }),
    ).not.toBeInTheDocument();
  });

  it('toggles displayed installation measurements between relative and absolute references', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Auto-place pieces/i }));

    expect(screen.getAllByText(/from top of Section 1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/from left side of Section 1/i).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('Use absolute installation measurements'));

    expect(screen.getAllByText(/from top-left wall origin/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/from top of Section 1/i)).not.toBeInTheDocument();
  });

  it('collapses and expands the Auto-placement and Features panels', async () => {
    const user = userEvent.setup();
    render(<App />);

    const autoPlacementToggle = screen.getByRole('button', { name: /Auto-placement/i });
    expect(autoPlacementToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Wall setup')).toBeInTheDocument();

    await user.click(autoPlacementToggle);

    expect(autoPlacementToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Wall setup')).not.toBeVisible();

    await user.click(autoPlacementToggle);

    expect(autoPlacementToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Wall setup')).toBeVisible();

    const featureToggle = screen.getByRole('button', { name: /Features/i });
    expect(featureToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Snap to grid')).toBeInTheDocument();

    await user.click(featureToggle);

    expect(featureToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Snap to grid')).not.toBeVisible();

    await user.click(featureToggle);

    expect(featureToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Snap to grid')).toBeVisible();
  });

  it('uses collapsible panels for setup, export, and measurements', async () => {
    const user = userEvent.setup();
    render(<App />);

    const wallSectionsToggle = screen.getByRole('button', { name: /Wall sections \(1\)/i });
    const artPiecesToggle = screen.getByRole('button', { name: /Art pieces \(1\)/i });
    const exportToggle = screen.getByRole('button', { name: /^Export$/i });
    const measurementsToggle = screen.getByRole('button', {
      name: /^Installation measurements$/i,
    });

    expect(screen.getByRole('complementary', { name: /Setup controls/i })).toContainElement(
      wallSectionsToggle,
    );
    expect(screen.getByRole('complementary', { name: /Setup controls/i })).toContainElement(
      artPiecesToggle,
    );
    expect(wallSectionsToggle.closest('.utility-panel')).toHaveClass(
      'setup-utility-panel',
      'wall-sections-panel',
    );
    expect(artPiecesToggle.closest('.utility-panel')).toHaveClass(
      'setup-utility-panel',
      'art-pieces-panel',
    );
    expect(screen.getByLabelText('Section 1 width')).toBeVisible();
    expect(screen.getByLabelText('Piece 1 width')).toBeVisible();
    expect(screen.getByText(/Print\/export layout/i)).toBeVisible();
    const measurementsTable = screen.getByRole('table', { name: /Installation measurements/i });
    expect(measurementsTable).toBeVisible();

    await user.click(wallSectionsToggle);
    await user.click(artPiecesToggle);
    await user.click(exportToggle);
    await user.click(measurementsToggle);

    expect(wallSectionsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(artPiecesToggle).toHaveAttribute('aria-expanded', 'false');
    expect(exportToggle).toHaveAttribute('aria-expanded', 'false');
    expect(measurementsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Section 1 width')).not.toBeVisible();
    expect(screen.getByLabelText('Piece 1 width')).not.toBeVisible();
    expect(screen.getByText(/Print\/export layout/i)).not.toBeVisible();
    expect(measurementsTable).not.toBeVisible();
  });

  it('gives repeated setup controls contextual accessible names', () => {
    render(<App />);

    expect(screen.getByLabelText('Section 1 corner after')).toBeInTheDocument();
    expect(screen.getByLabelText('Hooks for Piece 1')).toBeInTheDocument();
  });

  it('associates invalid dimensions with their input', async () => {
    const user = userEvent.setup();
    render(<App />);

    const width = screen.getByLabelText('Section 1 width');
    await user.clear(width);
    await user.type(width, '0');
    await user.tab();

    expect(width).toHaveAttribute('aria-invalid', 'true');
    expect(width).toHaveAttribute('aria-describedby');
    expect(
      within(width.closest('label') as HTMLElement).getByText(/positive width/i),
    ).toBeInTheDocument();

    await user.clear(width);
    await user.type(width, 'abc');
    await user.tab();
    expect(width).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows wall buffer guides persistently and art buffer guides only while moving a piece', () => {
    const { container } = render(<App />);

    expect(container.querySelectorAll('.wall-edge-buffer-guide')).toHaveLength(0);
    expect(container.querySelectorAll('.art-piece-buffer-guide')).toHaveLength(0);

    fireEvent.click(screen.getByLabelText('Wall edge buffer'));
    const wallGuides = container.querySelectorAll('.wall-edge-buffer-guide');
    expect(wallGuides.length).toBeGreaterThan(0);
    expect(wallGuides[0]).toHaveAttribute('stroke-dasharray');
    expect(wallGuides[0]).toHaveAttribute('stroke-width', '0.25');

    fireEvent.click(screen.getByLabelText('Art piece buffer'));
    const stagedPiece = screen.getByRole('button', { name: /Drag Piece 1 from staging/i });
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    mockPointerTarget(canvas);
    fireEvent.pointerDown(stagedPiece, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(screen.getByTestId('wall-drag-preview')).toHaveClass('art-piece-buffer-preview');
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 0, clientY: 0 });

    expect(container.querySelectorAll('.art-piece-buffer-guide')).toHaveLength(0);

    mockCanvasProjection(canvas);
    const wallPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    wallPiece.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 48,
          height: 60,
          x: 0,
          y: 0,
          top: 0,
          right: 48,
          bottom: 60,
          left: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    startWallPieceDrag(wallPiece, 20, 20);
    const wallPreview = screen.getByTestId('wall-drag-preview');
    expect(wallPreview).toHaveClass('art-piece-buffer-preview');
    expect(getComputedStyle(wallPreview).overflow).toBe('visible');
  });

  it('shows alignment guide lines while dragging a piece into a center snap', async () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [
          {
            id: 'wall',
            name: 'Wall',
            widthIn: 96,
            heightIn: 84,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [
          { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
          { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
        ],
        placements: [{ pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 }],
        features: {
          snapToGrid: false,
          gridSizeIn: 1,
          snapToAlignment: true,
          alignmentToleranceIn: 1,
          wallEdgeBuffer: false,
          wallEdgeBufferGapIn: 2,
          artPieceBuffer: false,
          artPieceBufferGapIn: 2,
          measurementReferenceMode: 'relative',
        },
        autoPlacementSettings: {
          wallSetupMode: 'available-sections',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [],
        },
        selectedPieceId: 'moving',
        message: 'Test design.',
      }),
    );
    const { container } = render(<App />);
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    mockPointerTarget(canvas);

    act(() => {
      screen
        .getByRole('button', { name: /Drag Moving from staging/i })
        .dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, clientX: 19.5, clientY: 17.5 }),
        );
    });

    const verticalGuide = await screen.findByTestId('alignment-guide-x');
    const horizontalGuide = await screen.findByTestId('alignment-guide-y');
    expect(verticalGuide).toHaveAttribute('x1', '20');
    expect(verticalGuide).toHaveAttribute('y1', '0');
    expect(verticalGuide).toHaveAttribute('y2', '84');
    expect(horizontalGuide).toHaveAttribute('y1', '18');
    expect(horizontalGuide).toHaveClass('center');
    expect(container.querySelectorAll('.alignment-snap-guide')).toHaveLength(2);
    expect(container.querySelectorAll('.alignment-snap-guide-backdrop')).toHaveLength(2);
  });

  it('hides alignment guide lines when the visibility toggle is off', async () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [
          {
            id: 'wall',
            name: 'Wall',
            widthIn: 96,
            heightIn: 84,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [
          { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
          { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
        ],
        placements: [{ pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 }],
        features: {
          snapToGrid: false,
          gridSizeIn: 1,
          snapToAlignment: true,
          showAlignmentGuides: true,
          alignmentToleranceIn: 1,
          wallEdgeBuffer: false,
          wallEdgeBufferGapIn: 2,
          artPieceBuffer: false,
          artPieceBufferGapIn: 2,
          measurementReferenceMode: 'relative',
        },
        autoPlacementSettings: {
          wallSetupMode: 'available-sections',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [],
        },
        selectedPieceId: 'moving',
        message: 'Test design.',
      }),
    );
    const { container } = render(<App />);
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    mockPointerTarget(canvas);

    await userEvent.click(screen.getByLabelText('Show alignment guides'));
    expect(screen.getByLabelText('Show alignment guides')).not.toBeChecked();

    act(() => {
      screen
        .getByRole('button', { name: /Drag Moving from staging/i })
        .dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, clientX: 19.5, clientY: 17.5 }),
        );
    });

    await waitFor(() =>
      expect(container.querySelectorAll('.alignment-snap-guide')).toHaveLength(0),
    );
  });

  it('clears alignment guide lines when a drag moves out of snap range', async () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [
          {
            id: 'wall',
            name: 'Wall',
            widthIn: 96,
            heightIn: 84,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [
          { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
          { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
        ],
        placements: [{ pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 }],
        features: {
          snapToGrid: false,
          gridSizeIn: 1,
          snapToAlignment: true,
          alignmentToleranceIn: 1,
          wallEdgeBuffer: false,
          wallEdgeBufferGapIn: 2,
          artPieceBuffer: false,
          artPieceBufferGapIn: 2,
          measurementReferenceMode: 'relative',
        },
        autoPlacementSettings: {
          wallSetupMode: 'available-sections',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [],
        },
        selectedPieceId: 'moving',
        message: 'Test design.',
      }),
    );
    const { container } = render(<App />);
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    mockPointerTarget(canvas);

    act(() => {
      screen
        .getByRole('button', { name: /Drag Moving from staging/i })
        .dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, clientX: 19.5, clientY: 17.5 }),
        );
    });
    await waitFor(() =>
      expect(container.querySelectorAll('.alignment-snap-guide')).toHaveLength(2),
    );

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }));
    });

    expect(container.querySelectorAll('.alignment-snap-guide')).toHaveLength(0);
  });

  it('lingers alignment guide lines for one second after a snapped drag ends', async () => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [
          {
            id: 'wall',
            name: 'Wall',
            widthIn: 96,
            heightIn: 84,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [
          { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
          { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
        ],
        placements: [{ pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 }],
        features: {
          snapToGrid: false,
          gridSizeIn: 1,
          snapToAlignment: true,
          alignmentToleranceIn: 1,
          wallEdgeBuffer: false,
          wallEdgeBufferGapIn: 2,
          artPieceBuffer: false,
          artPieceBufferGapIn: 2,
          measurementReferenceMode: 'relative',
        },
        autoPlacementSettings: {
          wallSetupMode: 'available-sections',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [],
        },
        selectedPieceId: 'moving',
        message: 'Test design.',
      }),
    );
    const { container } = render(<App />);
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    mockCanvasProjection(canvas);
    mockPointerTarget(canvas);

    act(() => {
      screen
        .getByRole('button', { name: /Drag Moving from staging/i })
        .dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, clientX: 19.5, clientY: 17.5 }),
        );
    });
    await screen.findByTestId('alignment-guide-x');
    vi.useFakeTimers();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 19.5, clientY: 17.5 });

    expect(screen.getByTestId('alignment-guide-x')).toHaveClass('is-lingering');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelectorAll('.alignment-snap-guide')).toHaveLength(0);
    vi.useRealTimers();
  });

  it('shows a lingering alignment guide when a keyboard nudge lands on alignment', () => {
    vi.useFakeTimers();
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [
          {
            id: 'wall',
            name: 'Wall',
            widthIn: 96,
            heightIn: 84,
            cornerAfter: 'none',
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [
          { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
          { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
        ],
        placements: [
          { pieceId: 'moving', sectionId: 'wall', xIn: 13.75, yIn: 40 },
          { pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 },
        ],
        features: {
          snapToGrid: false,
          gridSizeIn: 1,
          snapToAlignment: true,
          alignmentToleranceIn: 1,
          wallEdgeBuffer: false,
          wallEdgeBufferGapIn: 2,
          artPieceBuffer: false,
          artPieceBufferGapIn: 2,
          measurementReferenceMode: 'relative',
        },
        autoPlacementSettings: {
          wallSetupMode: 'available-sections',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [],
        },
        selectedPieceId: 'moving',
        message: 'Test design.',
      }),
    );
    const { container } = render(<App />);

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByTestId('alignment-guide-x')).toHaveAttribute('x1', '20');
    expect(screen.getByTestId('alignment-guide-x')).toHaveClass('is-lingering');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelectorAll('.alignment-snap-guide')).toHaveLength(0);
    vi.useRealTimers();
  });

  it('allows selected art pieces to be deselected', () => {
    render(<App />);

    const pieceRow = screen.getByLabelText('Piece 1 label').closest('article');

    expect(pieceRow).toHaveClass('selected');

    fireEvent.click(pieceRow!);

    expect(pieceRow).not.toHaveClass('selected');
  });

  it('allows a wall section and art piece to be selected at the same time', async () => {
    const user = userEvent.setup();
    render(<App />);

    const sectionRow = screen.getByLabelText('Section 1 name').closest('article');
    const pieceRow = screen.getByLabelText('Piece 1 label').closest('article');
    const canvasSection = screen.getByRole('button', { name: /^Move Section 1$/i });

    expect(sectionRow).not.toHaveClass('selected');
    expect(canvasSection).not.toHaveClass('selected');

    fireEvent.pointerDown(canvasSection);

    expect(sectionRow).toHaveClass('selected');
    expect(canvasSection).toHaveClass('selected');

    await user.click(screen.getByLabelText('Piece 1 label'));

    expect(pieceRow).toHaveClass('selected');
    expect(sectionRow).toHaveClass('selected');
    expect(canvasSection).toHaveClass('selected');

    fireEvent.click(pieceRow!);

    expect(pieceRow).not.toHaveClass('selected');
    expect(sectionRow).toHaveClass('selected');
    expect(canvasSection).toHaveClass('selected');
  });

  it('does not render a clear selection command', () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: /Clear selection/i })).not.toBeInTheDocument();
  });

  it('clears selection when clicking non-item page space', async () => {
    const user = userEvent.setup();
    render(<App />);

    const sectionRow = screen.getByLabelText('Section 1 name').closest('article');
    const pieceRow = screen.getByLabelText('Piece 1 label').closest('article');
    const canvasSection = screen.getByRole('button', { name: /^Move Section 1$/i });

    fireEvent.pointerDown(canvasSection);
    await user.click(screen.getByLabelText('Piece 1 label'));

    expect(pieceRow).toHaveClass('selected');
    expect(sectionRow).toHaveClass('selected');

    fireEvent.pointerDown(screen.getByRole('img', { name: /Scaled gallery wall layout/i }));

    expect(pieceRow).not.toHaveClass('selected');
    expect(sectionRow).not.toHaveClass('selected');
  });

  it('keeps a floating preview visible while dragging a wall piece toward the tray', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Grid size (in)'), { target: { value: '10' } });

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    placeStagedPieceOnWall();
    mockCanvasProjection(canvas);

    const wallPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    wallPiece.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 64,
          height: 80,
          x: 0,
          y: 0,
          top: 0,
          right: 64,
          bottom: 80,
          left: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    const initialX = wallPiece.getAttribute('x');
    const initialY = wallPiece.getAttribute('y');

    await act(async () => {
      wallPiece.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }),
      );
    });

    expect(wallPiece.closest('g')).toHaveClass('selected');
    expect(document.body).toHaveClass('suppress-text-selection');

    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 83, clientY: 84, cancelable: true }),
      );
    });

    const preview = screen.getByTestId('wall-drag-preview');
    expect(preview).toHaveTextContent('Piece 1');
    expect(preview).toHaveClass('wall-drag-preview');
    expect(preview).toHaveStyle({ width: '64px', height: '80px' });
    expect(preview).toHaveStyle({ left: '108px', top: '110px' });
    expect(wallPiece).toHaveAttribute('x', initialX);
    expect(wallPiece).toHaveAttribute('y', initialY);
  });

  it('uses the same fitted multi-line label treatment in a wall drag preview', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('Piece 1 label'), {
      target: { value: 'The Walking Dead' },
    });
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    placeStagedPieceOnWall(/Drag The Walking Dead from staging/i);
    mockCanvasProjection(canvas);

    const wallPiece = screen.getByRole('button', { name: /^Move The Walking Dead$/i });
    const placedLines = Array.from(container.querySelectorAll('.piece-label tspan')).map(
      (line) => line.textContent,
    );
    wallPiece.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 64,
          height: 80,
          x: 0,
          y: 0,
          top: 0,
          right: 64,
          bottom: 80,
          left: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    startWallPieceDrag(wallPiece, 20, 20);

    const preview = screen.getByTestId('wall-drag-preview');
    const previewLines = Array.from(preview.querySelectorAll('.piece-label tspan')).map(
      (line) => line.textContent,
    );
    expect(preview.querySelector('.wall-drag-preview-svg')).toBeInTheDocument();
    expect(preview.querySelector('.preview-piece-label')).not.toBeInTheDocument();
    expect(previewLines).toEqual(placedLines);
    expect(previewLines).toEqual(['The', 'Walking', 'Dead']);
  });

  it('moves workspace actions above the canvas and moves export readiness into the export panel', () => {
    render(<App />);

    const editorControls = screen.getByRole('toolbar', { name: /Editor controls/i });
    const canvasCard = document.querySelector('.canvas-card');
    expect(canvasCard).toBeInTheDocument();
    expect(editorControls).toContainElement(screen.getByLabelText('Units'));
    expect(editorControls).toContainElement(screen.getByLabelText('Appearance'));
    expect(editorControls).toContainElement(screen.getByLabelText('Theme'));
    expect(editorControls).toContainElement(
      screen.getByRole('button', { name: /^Auto-place pieces$/i }),
    );
    expect(editorControls).toContainElement(screen.getByRole('button', { name: /Clear/i }));
    expect(screen.getByRole('group', { name: /Placement controls/i })).toContainElement(
      screen.getByRole('button', { name: /^Auto-place pieces$/i }),
    );
    expect(screen.queryByRole('group', { name: /View controls/i })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Wall zoom controls/i })).toContainElement(
      screen.getByRole('button', { name: /Zoom out/i }),
    );
    expect(screen.getByRole('group', { name: /Wall zoom controls/i })).toContainElement(
      screen.getByRole('button', { name: /Fit wall/i }),
    );
    expect(screen.getByRole('group', { name: /Wall zoom controls/i })).toContainElement(
      screen.getByRole('button', { name: /Zoom in/i }),
    );
    expect(canvasCard).toContainElement(screen.getByRole('group', { name: /Wall zoom controls/i }));
    const rightPanel = screen.getByRole('complementary', { name: /Details and export/i });
    const statusPanel = within(rightPanel).getByRole('status').closest('.status-panel');
    const primaryColumn = rightPanel.querySelector('.right-panel-column-primary');
    const secondaryColumn = rightPanel.querySelector('.right-panel-column-secondary');
    expect(statusPanel).toBeInTheDocument();
    expect(primaryColumn).toBeInTheDocument();
    expect(secondaryColumn).toBeInTheDocument();
    expect(
      within(primaryColumn as Element).getByRole('heading', { name: /Auto-placement/i }),
    ).toBeInTheDocument();
    expect(primaryColumn).toContainElement(statusPanel);
    expect(
      within(secondaryColumn as Element).getByRole('heading', { name: /Features/i }),
    ).toBeInTheDocument();
    expect(
      within(secondaryColumn as Element).getByRole('heading', { name: /^Export$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Appearance controls/i })).toContainElement(
      screen.getByLabelText('Theme'),
    );
    expect(screen.getByRole('status')).toHaveTextContent(/Enter wall and art dimensions/i);
    const exportPanel = screen.getByRole('complementary', { name: /Details and export/i });
    const exportTitle = within(exportPanel).getByRole('heading', { name: /^Export$/i });
    expect(exportTitle.closest('.panel-title')).toBeInTheDocument();
    expect(within(exportPanel).queryByText(/Ready to export/i)).not.toBeInTheDocument();
    expect(within(exportPanel).queryByText(/Needs attention/i)).not.toBeInTheDocument();
    expect(within(exportPanel).getByText(/Print\/export layout/i)).toBeInTheDocument();
    expect(within(exportPanel).getByText(/Save\/load design/i)).toBeInTheDocument();
    expect(screen.getByText(/PNG and PDF exports include the visual layout/i)).toHaveClass(
      'info-tooltip',
    );
    expect(screen.getByText(/editable project file/i)).toHaveClass('info-tooltip');
    expect(
      within(exportPanel).queryByText(/saved locally in this browser/i),
    ).not.toBeInTheDocument();
    expect(
      within(exportPanel).getByRole('button', { name: /Print\/export layout information/i }),
    ).toHaveAccessibleDescription(/visual layout, piece table, and installation measurements/i);
    expect(
      within(exportPanel).getByRole('button', { name: /Save\/load design information/i }),
    ).toHaveAccessibleDescription(/editable project file/i);
    expect(
      within(exportPanel).getByText(/Print exports are for installation/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export PNG/i })).toHaveAttribute(
      'title',
      expect.stringContaining('Piece 1 has not been placed.'),
    );
    expect(screen.getByRole('button', { name: /Export PDF/i })).toHaveAttribute(
      'title',
      expect.stringContaining('Piece 1 has not been placed.'),
    );
  });

  it('zooms and pans the wall canvas with wheel gestures', () => {
    render(<App />);

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    canvas.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 248,
          height: 244,
          x: 0,
          y: 0,
          top: 0,
          right: 248,
          bottom: 244,
          left: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        }) as DOMMatrix,
    );

    const initialViewBox = parseViewBox(canvas.getAttribute('viewBox'));

    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -160, clientX: 40, clientY: 40 });

    const zoomedViewBox = parseViewBox(canvas.getAttribute('viewBox'));
    expect(zoomedViewBox.width).toBeLessThan(initialViewBox.width);
    expect(zoomedViewBox.height).toBeLessThan(initialViewBox.height);

    fireEvent.wheel(canvas, { deltaY: 80, deltaX: 0, clientX: 120, clientY: 120 });

    const wheelPannedViewBox = parseViewBox(canvas.getAttribute('viewBox'));
    expect(wheelPannedViewBox.y).toBeGreaterThan(zoomedViewBox.y);

    expect(canvas.querySelector('.wall-pan-surface')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fit wall/i }));

    const resetViewBox = parseViewBox(canvas.getAttribute('viewBox'));
    expect(resetViewBox.width).toBeCloseTo(initialViewBox.width, 5);
    expect(resetViewBox.height).toBeCloseTo(initialViewBox.height, 5);
  });

  it('lets the user choose light, dark, or system theme modes and persists the choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    const modeSelect = screen.getByLabelText('Appearance');
    const themeSelect = screen.getByLabelText('Theme');
    expect(modeSelect).toHaveValue('system');
    expect(themeSelect).toHaveValue('slate');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-palette', 'slate');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.selectOptions(modeSelect, 'light');

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(JSON.parse(localStorage.getItem('gallery-designer-state-v1') ?? '{}')).toMatchObject({
      themeMode: 'light',
    });

    await user.selectOptions(themeSelect, 'coastal-blue');

    expect(document.documentElement).toHaveAttribute('data-palette', 'coastal-blue');
    expect(JSON.parse(localStorage.getItem('gallery-designer-state-v1') ?? '{}')).toMatchObject({
      applicationTheme: 'coastal-blue',
    });

    await user.selectOptions(modeSelect, 'dark');

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('groups unplaced export warnings that share the same piece label', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Add art piece/i }));
    await user.clear(screen.getByLabelText('Piece 2 label'));
    await user.type(screen.getByLabelText('Piece 2 label'), 'Piece 1');

    expect(screen.queryAllByText('Piece 1 has not been placed.')).toHaveLength(0);
    expect(screen.getByText('2 pieces named Piece 1 have not been placed.')).toBeInTheDocument();
  });

  it('renders wall section labels outside the wall and wraps art labels inside pieces', () => {
    const { container } = render(<App />);

    expect(container.querySelector('#minor-grid path')).toHaveAttribute(
      'stroke',
      'var(--grid-line)',
    );

    const sectionLabel = container.querySelector('.section-label');
    expect(Number(sectionLabel?.getAttribute('y'))).toBeLessThan(0);

    fireEvent.change(screen.getByLabelText('Piece 1 label'), {
      target: { value: 'The Walking Dead' },
    });
    placeStagedPieceOnWall(/Drag The Walking Dead from staging/i);

    expect(container.querySelectorAll('.piece-label tspan').length).toBeGreaterThan(1);
    const clipRect = container.querySelector('clipPath[id^="piece-label-clip-"] rect');
    const pieceRect = screen.getByRole('button', { name: /^Move The Walking Dead$/i });
    expect(clipRect).toBeInTheDocument();
    expect(
      Number(clipRect?.getAttribute('x')) - Number(pieceRect.getAttribute('x')),
    ).toBeGreaterThanOrEqual(1);
  });

  it('wraps art labels without splitting individual words', () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('Piece 1 label'), {
      target: { value: 'Supercalifragilisticexpialidocious Print' },
    });
    placeStagedPieceOnWall(/Drag Supercalifragilisticexpialidocious Print from staging/i);

    const lines = Array.from(container.querySelectorAll('.piece-label tspan')).map(
      (line) => line.textContent,
    );
    expect(lines.join(' ')).toContain('Supercalifragilisticexpialidocious');
    expect(lines.join(' ')).toContain('Print');
    expect(lines).not.toContain('Supercalifragilisticexp');
  });

  it('moves labels below art pieces when the piece is too small for legible text', () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('Piece 1 label'), {
      target: { value: 'MCFN' },
    });
    fireEvent.change(screen.getByLabelText('Piece 1 width'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Piece 1 height'), {
      target: { value: '6' },
    });
    placeStagedPieceOnWall(/Drag MCFN from staging/i);

    const pieceRect = container.querySelector('.piece rect[aria-label="Move MCFN"]');
    const label = container.querySelector('.outside-piece-label');
    expect(label).toBeInTheDocument();
    expect(Number(label?.getAttribute('y'))).toBeGreaterThan(
      Number(pieceRect?.getAttribute('y')) + Number(pieceRect?.getAttribute('height')),
    );
  });

  it('keeps the staging tray inside the design layout panel', () => {
    render(<App />);

    const layoutPanel = screen
      .getByRole('img', { name: /Scaled gallery wall layout/i })
      .closest('.canvas-card');
    const stagingTray = screen.getByRole('region', { name: /Art staging tray/i });
    expect(layoutPanel).toContainElement(stagingTray);
  });
});

function mockCanvasProjection(canvas: HTMLElement) {
  Object.defineProperty(canvas, 'getScreenCTM', {
    configurable: true,
    writable: true,
    value: vi.fn(
      () =>
        ({
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: 0,
          f: 0,
          inverse: () => ({
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: 0,
            f: 0,
          }),
        }) as DOMMatrix,
    ),
  });
}

function mockPointerTarget(element: Element) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => element),
  });
}

function startWallPieceDrag(piece: Element, clientX: number, clientY: number) {
  act(() => {
    piece.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        clientX,
        clientY,
      }),
    );
  });
}

function placeStagedPieceOnWall(
  name: RegExp | string = /Drag Piece 1 from staging/i,
  point = { clientX: 50, clientY: 50 },
) {
  const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
  mockCanvasProjection(canvas);
  mockPointerTarget(canvas);
  const stagedPiece = screen.getByRole('button', { name });
  act(() => {
    fireEvent.pointerDown(stagedPiece, {
      pointerId: 1,
      clientX: point.clientX,
      clientY: point.clientY,
    });
    window.dispatchEvent(
      new MouseEvent('pointermove', {
        clientX: point.clientX,
        clientY: point.clientY,
        cancelable: true,
      }),
    );
    window.dispatchEvent(
      new MouseEvent('pointerup', { clientX: point.clientX, clientY: point.clientY }),
    );
  });
  return canvas;
}

function parseViewBox(viewBox: string | null): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!viewBox) {
    throw new Error('Expected a viewBox.');
  }

  const [x, y, width, height] = viewBox.split(' ').map(Number);
  return { x, y, width, height };
}
