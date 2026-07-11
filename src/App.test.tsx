import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('Gallery Designer app', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    document.body.classList.remove('suppress-text-selection');
    document.querySelectorAll('.piece-drag-preview').forEach((element) => element.remove());
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

  it('renders the gallery-wall logo decoratively in the header', () => {
    const { container } = render(<App />);

    const logo = container.querySelector<HTMLImageElement>('.brand-logo');
    expect(logo).toHaveAttribute('src', '/gallery-wall-logo.svg');
    expect(logo).toHaveAttribute('alt', '');
    expect(logo).toHaveAttribute('aria-hidden', 'true');
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
    expect(screen.queryByRole('button', { name: /Place on first wall/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add art piece/i }));

    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drag Piece 2 from staging/i })).toBeInTheDocument();
  });

  it('does not render manual wall section position fields', () => {
    render(<App />);

    expect(screen.queryByLabelText('Section 1 X position')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Section 1 Y position')).not.toBeInTheDocument();
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

  it('uses rendered drag previews for staged pieces and pointer previews for wall pieces', () => {
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

    const stagedTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer: stagedTransfer,
    });

    expect(stagedTransfer.setDragImage).toHaveBeenCalled();
    expect(document.body).toHaveClass('suppress-text-selection');
    expect(stagedTransfer.setDragImage).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          width: '32px',
          height: '40px',
        }) as CSSStyleDeclaration,
      }) as HTMLElement,
      16,
      20,
    );
    fireEvent.dragEnd(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }));
    expect(document.body).not.toHaveClass('suppress-text-selection');

    const dropTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer: dropTransfer,
    });
    fireEvent.drop(canvas, {
      dataTransfer: dropTransfer,
      clientX: 0,
      clientY: 0,
    });

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).not.toHaveAttribute(
      'draggable',
    );
  });

  it('keeps a staged-piece drop aligned to the same snapped grid position shown by the preview', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Grid size (in)'), { target: { value: '10' } });
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });

    const dataTransfer = createDataTransfer();
    const stagedPiece = screen.getByRole('button', { name: /Drag Piece 1 from staging/i });
    fireEvent.dragStart(stagedPiece, { dataTransfer });
    fireEvent.drop(canvas, { dataTransfer, clientX: 0, clientY: 0 });

    const placedPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const placedX = Number(placedPiece.getAttribute('x'));
    const placedY = Number(placedPiece.getAttribute('y'));
    expect(placedX % 10).toBe(0);
    expect(placedY % 10).toBe(0);
  });

  it('does not make wall pieces browser-focusable', () => {
    render(<App />);

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).not.toHaveAttribute('tabindex');
  });

  it('nudges a selected placed art piece with arrow keys outside the canvas focus target', () => {
    render(<App />);

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

    const piece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const startX = Number(piece.getAttribute('x'));
    const startY = Number(piece.getAttribute('y'));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });

    expect(Number(piece.getAttribute('x'))).toBe(startX + 0.25);
    expect(Number(piece.getAttribute('y'))).toBe(startY + 1);
  });

  it('does not nudge a piece while editing a form field', () => {
    render(<App />);

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

    const piece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    const startX = piece.getAttribute('x');
    fireEvent.keyDown(screen.getByLabelText('Piece 1 width'), { key: 'ArrowRight' });

    expect(piece).toHaveAttribute('x', startX ?? '');
  });

  it('moves pieces from staging to the wall and back to staging with drag and pointer drop', () => {
    render(<App />);

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

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

    fireEvent.pointerDown(wallPiece, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerUp(window, {
      pointerId: 1,
      clientX: 20,
      clientY: 200,
    });

    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move Piece 1$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Piece 1 has not been placed/i)).toBeInTheDocument();
  });

  it('prevents native text selection while a wall-piece drag leaves the canvas', () => {
    render(<App />);

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    fireEvent.drop(canvas, { dataTransfer, clientX: 0, clientY: 0 });
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        }) as DOMMatrix,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /^Move Piece 1$/i }), {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    });
    const pointerMove = new Event('pointermove', { cancelable: true });
    window.dispatchEvent(pointerMove);

    expect(pointerMove.defaultPrevented).toBe(true);
  });

  it('keeps a newly placed piece selected after its next pointer pick-up', () => {
    render(<App />);

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    fireEvent.drop(canvas, { dataTransfer, clientX: 0, clientY: 0 });
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        }) as DOMMatrix,
    );

    const wallPiece = screen.getByRole('button', { name: /^Move Piece 1$/i });
    fireEvent.pointerDown(wallPiece, { pointerId: 1, clientX: 20, clientY: 20 });
    expect(screen.getByTestId('wall-drag-preview')).toBeInTheDocument();
    fireEvent.click(wallPiece);

    expect(wallPiece.closest('g')).toHaveClass('selected');
  });

  it('allows decimal piece sizes while typing', async () => {
    const user = userEvent.setup();
    render(<App />);

    const width = screen.getByLabelText('Piece 1 width');
    await user.clear(width);
    await user.type(width, '12.5');

    expect(width).toHaveValue('12.5');
  });

  it('resets the wall by returning all pieces to the staging tray', async () => {
    const user = userEvent.setup();
    render(<App />);

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

    expect(screen.getByRole('button', { name: /^Move Piece 1$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reset wall/i }));

    expect(screen.getByRole('button', { name: /Drag Piece 1 from staging/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Move Piece 1$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Piece 1 has not been placed/i)).toBeInTheDocument();
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
    expect(screen.getByLabelText('Wall edge buffer')).not.toBeChecked();
    expect(screen.getByLabelText('Art piece buffer')).not.toBeChecked();
    expect(screen.getByLabelText('Grid size (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Alignment tolerance (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Wall edge buffer gap (in)')).toBeInTheDocument();
    expect(screen.getByLabelText('Art piece buffer gap (in)')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Grid size (in)'));
    await user.type(screen.getByLabelText('Grid size (in)'), '2.5');

    expect(screen.getByLabelText('Grid size (in)')).toHaveValue('2.5');

    await user.selectOptions(screen.getByLabelText('Units'), 'cm');
    expect(screen.getByLabelText('Grid size (cm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Alignment tolerance (cm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Wall edge buffer gap (cm)')).toHaveValue('5.1');
    expect(screen.getByLabelText('Art piece buffer gap (cm)')).toHaveValue('5.1');
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

    const dataTransfer = createDataTransfer();
    fireEvent.click(screen.getByLabelText('Art piece buffer'));
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(
      expect.objectContaining({ className: expect.stringContaining('art-piece-buffer-preview') }),
      expect.any(Number),
      expect.any(Number),
    );
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

    expect(container.querySelectorAll('.art-piece-buffer-guide')).toHaveLength(0);

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        }) as DOMMatrix,
    );
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
    fireEvent.pointerDown(wallPiece, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    });
    const wallPreview = screen.getByTestId('wall-drag-preview');
    expect(wallPreview).toHaveClass('art-piece-buffer-preview');
    expect(getComputedStyle(wallPreview).overflow).toBe('visible');
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

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag Piece 1 from staging/i }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: 0,
          f: 0,
          m11: 1,
          m12: 0,
          m21: 0,
          m22: 1,
          m41: 0,
          m42: 0,
          inverse: () => ({
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: 0,
            f: 0,
            m11: 1,
            m12: 0,
            m21: 0,
            m22: 1,
            m41: 0,
            m42: 0,
          }),
        }) as DOMMatrix,
    );

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
    expect(preview).toHaveStyle({ left: '108px', top: '100px' });
    expect(wallPiece).toHaveAttribute('x', initialX);
    expect(wallPiece).toHaveAttribute('y', initialY);
  });

  it('uses the same fitted multi-line label treatment in a wall drag preview', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Piece 1 label'), {
      target: { value: 'The Walking Dead' },
    });
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(
      screen.getByRole('button', { name: /Drag The Walking Dead from staging/i }),
      { dataTransfer },
    );
    const canvas = screen.getByRole('img', { name: /Scaled gallery wall layout/i });
    fireEvent.drop(canvas, { dataTransfer, clientX: 0, clientY: 0 });
    canvas.getScreenCTM = vi.fn(
      () =>
        ({
          inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        }) as DOMMatrix,
    );

    const wallPiece = screen.getByRole('button', { name: /^Move The Walking Dead$/i });
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
    fireEvent.pointerDown(wallPiece, { pointerId: 1, clientX: 20, clientY: 20 });

    const preview = screen.getByTestId('wall-drag-preview');
    expect(preview.querySelectorAll('.preview-piece-label-line')).toHaveLength(3);
    expect(preview.querySelector('.preview-piece-label')).toHaveStyle({ fontSize: '12px' });
  });

  it('moves workspace actions above the canvas and moves export readiness into the export panel', () => {
    render(<App />);

    const editorControls = screen.getByRole('toolbar', { name: /Editor controls/i });
    expect(editorControls).toContainElement(screen.getByLabelText('Units'));
    expect(editorControls).toContainElement(screen.getByLabelText('Theme'));
    expect(editorControls).toContainElement(screen.getByRole('button', { name: /Auto-place/i }));
    expect(editorControls).toContainElement(screen.getByRole('button', { name: /Reset wall/i }));
    const toolbarItems = Array.from(editorControls.children).map((element) =>
      element.textContent?.trim(),
    );
    expect(toolbarItems).toEqual([
      expect.stringContaining('Units'),
      expect.stringContaining('Auto-place pieces'),
      expect.stringContaining('Reset wall'),
      expect.stringContaining('Theme'),
    ]);
    expect(screen.getByLabelText('Theme').closest('label')).toHaveClass('theme-field');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const exportPanel = screen.getByRole('complementary', { name: /Details and export/i });
    const exportTitle = within(exportPanel).getByRole('heading', { name: /^Export$/i });
    expect(exportTitle.closest('.panel-title')).toBeInTheDocument();
    expect(within(exportPanel).queryByText(/Ready to export/i)).not.toBeInTheDocument();
    expect(within(exportPanel).queryByText(/Needs attention/i)).not.toBeInTheDocument();
    expect(within(exportPanel).getByText(/Print\/export layout/i)).toBeInTheDocument();
    expect(within(exportPanel).getByText(/Save\/load design/i)).toBeInTheDocument();
    expect(within(exportPanel).getByText(/editable project file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export PNG/i })).toHaveAttribute(
      'title',
      expect.stringContaining('Piece 1 has not been placed.'),
    );
    expect(screen.getByRole('button', { name: /Export PDF/i })).toHaveAttribute(
      'title',
      expect.stringContaining('Piece 1 has not been placed.'),
    );
  });

  it('lets the user choose light, dark, or system theme modes and persists the choice', async () => {
    const user = userEvent.setup();
    render(<App />);

    const themeSelect = screen.getByLabelText('Theme');
    expect(themeSelect).toHaveValue('system');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.selectOptions(themeSelect, 'light');

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(JSON.parse(localStorage.getItem('gallery-designer-state-v1') ?? '{}')).toMatchObject({
      themeMode: 'light',
    });

    await user.selectOptions(themeSelect, 'dark');

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
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(
      screen.getByRole('button', { name: /Drag The Walking Dead from staging/i }),
      {
        dataTransfer,
      },
    );
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

    expect(container.querySelectorAll('.piece-label tspan').length).toBeGreaterThan(1);
    expect(container.querySelector('clipPath[id^="piece-label-clip-"]')).toBeInTheDocument();
  });

  it('wraps art labels without splitting individual words', () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('Piece 1 label'), {
      target: { value: 'Supercalifragilisticexpialidocious Print' },
    });
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(
      screen.getByRole('button', {
        name: /Drag Supercalifragilisticexpialidocious Print from staging/i,
      }),
      {
        dataTransfer,
      },
    );
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

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
    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: /Drag MCFN from staging/i }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByRole('img', { name: /Scaled gallery wall layout/i }), {
      dataTransfer,
      clientX: 0,
      clientY: 0,
    });

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

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn((type?: string) => {
      if (type) {
        values.delete(type);
      } else {
        values.clear();
      }
    }),
    getData: vi.fn((type: string) => values.get(type) ?? ''),
    setData: vi.fn((type: string, value: string) => {
      values.set(type, value);
    }),
    setDragImage: vi.fn(),
  };
}
