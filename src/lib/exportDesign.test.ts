import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jsPDF from 'jspdf';
import type { ArtPiece, Placement, WallSection } from '../types';
import { buildMeasurementInstructions } from './measurements';
import { buildMeasurementTableRows } from './measurementTable';
import {
  buildPdfMeasurementRowLayout,
  buildExportSheetSvg,
  downloadBlob,
  fitWithin,
  getPdfMeasurementInitialRequiredHeight,
  getSvgMeasurementRowHeight,
  renderSvgToPngBlob,
  type ExportDesignInput,
} from './exportDesign';

const sections: WallSection[] = [
  {
    id: 'wall-1',
    name: 'Main & Entry',
    widthIn: 120,
    heightIn: 96,
    cornerAfter: 'none',
    xIn: 0,
    yIn: 0,
  },
  {
    id: 'wall-2',
    name: 'Return',
    widthIn: 48,
    heightIn: 72,
    cornerAfter: 'none',
    xIn: 120,
    yIn: 24,
  },
];

const pieces: ArtPiece[] = [
  {
    id: 'piece-1',
    label: 'First <Print>',
    widthIn: 20,
    heightIn: 16,
    hookSpec: { count: 1, leftOffsetIn: 10, topOffsetIn: 2 },
  },
  {
    id: 'piece-2',
    label: 'Second & Print',
    widthIn: 12,
    heightIn: 18,
  },
];

const placements: Placement[] = [
  { pieceId: 'piece-1', sectionId: 'wall-1', xIn: 8, yIn: 10 },
  { pieceId: 'piece-2', sectionId: 'wall-2', xIn: 12, yIn: 16 },
];

function makeInput(): ExportDesignInput {
  return {
    sections,
    pieces,
    placements,
    measurements: buildMeasurementInstructions(sections, pieces, placements, 'in'),
    unit: 'in',
  };
}

function makeTwoHookInput(): ExportDesignInput {
  const longPiece: ArtPiece = {
    id: 'piece-two-hook',
    label: 'Wide framed city panorama with very long descriptive label',
    widthIn: 36,
    heightIn: 18,
    hookSpec: {
      count: 2,
      leftTopOffsetIn: 3,
      leftSideOffsetIn: 5,
      rightTopOffsetIn: 3,
      rightSideOffsetIn: 5,
    },
  };
  const inputSections: WallSection[] = [
    {
      id: 'wall-wide',
      name: 'Long hallway section with a descriptive name',
      widthIn: 96,
      heightIn: 72,
      cornerAfter: 'none',
      xIn: 0,
      yIn: 0,
    },
  ];
  const inputPlacements: Placement[] = [
    { pieceId: longPiece.id, sectionId: 'wall-wide', xIn: 15, yIn: 12 },
  ];

  return {
    sections: inputSections,
    pieces: [longPiece],
    placements: inputPlacements,
    measurements: buildMeasurementInstructions(inputSections, [longPiece], inputPlacements, 'in'),
    unit: 'in',
  };
}

describe('buildExportSheetSvg', () => {
  it('builds a self-contained full installation sheet', () => {
    const sheet = buildExportSheetSvg(makeInput());
    const diagramMarkup = sheet.markup.slice(
      sheet.markup.indexOf('<rect x="72" y="132"'),
      sheet.markup.indexOf('Piece inventory'),
    );

    expect(sheet.width).toBe(1600);
    expect(sheet.height).toBeGreaterThan(900);
    expect(sheet.markup).toContain('viewBox="0 0 1600');
    expect(sheet.markup).toContain('fill="#ffffff"');
    expect(sheet.markup).toContain('font-family="Arial, Helvetica, sans-serif"');
    expect(sheet.markup).not.toContain('var(');
    expect(sheet.markup).not.toContain('class=');
    expect(sheet.markup).toContain('Main &amp; Entry');
    expect(sheet.markup).toContain('First &lt;Print&gt;');
    expect(sheet.markup).toContain('Second &amp; Print');
    expect(sheet.markup).toContain('Piece inventory');
    expect(sheet.markup).toContain('Installation measurements');
    expect(sheet.markup).toContain('Place the piece');
    expect(sheet.markup).toContain('Dimensions');
    expect(sheet.markup).toContain('20 in x 16 in');
    expect(sheet.markup).toContain('Top: 10 in from top of Main &amp; Entry');
    expect(sheet.markup).toContain('Hook: 2 in down, 10 in from left');
    expect(diagramMarkup).not.toContain('20 in x 16 in');
    expect(diagramMarkup).not.toContain('12 in x 18 in');
  });

  it('preserves upper-left-first measurement ordering', () => {
    const { markup } = buildExportSheetSvg(makeInput());
    const firstRow = markup.indexOf('1. First &lt;Print&gt;');
    const secondRow = markup.indexOf('2. Second &amp; Print');

    expect(firstRow).toBeGreaterThan(-1);
    expect(secondRow).toBeGreaterThan(firstRow);
  });

  it('keeps piece inventory compact and leaves placement instructions to measurements', () => {
    const { markup } = buildExportSheetSvg(makeInput());
    const inventoryMarkup = markup.slice(
      markup.indexOf('Piece inventory'),
      markup.indexOf('Installation measurements'),
    );

    expect(inventoryMarkup).toContain('Piece inventory');
    expect(inventoryMarkup).toContain('Order');
    expect(inventoryMarkup).toContain('Piece');
    expect(inventoryMarkup).toContain('Section');
    expect(inventoryMarkup).toContain('Size');
    expect(inventoryMarkup).not.toContain('Position');
    expect(inventoryMarkup).not.toContain('Left 8 in, top 10 in');
    expect(inventoryMarkup).not.toContain('Left 12 in, top 16 in');
    expect(inventoryMarkup).toContain('height="40"');
    expect(inventoryMarkup).not.toContain('height="52"');
  });

  it('wraps long hook instructions in PNG measurement rows', () => {
    const input = makeTwoHookInput();
    const row = buildMeasurementTableRows(input.measurements, { includeDimensions: true })[0];
    const { markup } = buildExportSheetSvg(input);
    const measurementMarkup = markup.slice(markup.indexOf('Installation measurements'));

    expect(row.hooks).toContain('; Right hook:');
    expect(getSvgMeasurementRowHeight(row)).toBeGreaterThan(78);
    expect(measurementMarkup).toContain('<tspan');
    expect(measurementMarkup).not.toContain(`>${row.hooks}</text>`);
  });

  it('matches the app wall diagram with exterior edges and outside section labels', () => {
    const alignedInput = makeInput();
    alignedInput.sections = [
      { ...sections[0], widthIn: 80, heightIn: 60, yIn: 0 },
      { ...sections[1], xIn: 80, widthIn: 40, heightIn: 60, yIn: 0 },
    ];
    alignedInput.placements = [];
    alignedInput.measurements = [];
    const { markup } = buildExportSheetSvg(alignedInput);
    const diagramMarkup = markup.slice(
      markup.indexOf('<rect x="72" y="132"'),
      markup.indexOf('Piece inventory'),
    );
    const strokedSectionRectMatches =
      diagramMarkup.match(/<rect\b[^>]*fill="#f4f6f5"[^>]*stroke="#607080"/g) ?? [];
    const verticalExteriorLines = Array.from(diagramMarkup.matchAll(/<line\b[^>]*>/g)).filter(
      ([line]) => {
        const x1 = line.match(/x1="([^"]+)"/)?.[1];
        const x2 = line.match(/x2="([^"]+)"/)?.[1];
        return x1 !== undefined && x1 === x2;
      },
    );
    const mainLabelY = Number(
      diagramMarkup.match(/<text x="[^"]+" y="([^"]+)"[^>]*>Main &amp; Entry/)?.[1],
    );
    const mainWallY = Number(
      diagramMarkup.match(/<rect x="[^"]+" y="([^"]+)"[^>]*fill="#f4f6f5"/)?.[1],
    );

    expect(strokedSectionRectMatches).toHaveLength(0);
    expect(diagramMarkup).toContain('stroke="#607080" stroke-width="3"');
    expect(verticalExteriorLines).toHaveLength(2);
    expect(mainLabelY).toBeLessThan(mainWallY);
  });
});

describe('PDF measurement table layout', () => {
  it('reserves space for the title, header, and first row before drawing the table', () => {
    const input = makeTwoHookInput();
    const rows = buildMeasurementTableRows(input.measurements, { includeDimensions: true });
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const firstRowLayout = buildPdfMeasurementRowLayout(doc, rows[0]);

    expect(getPdfMeasurementInitialRequiredHeight(doc, rows)).toBe(42 + firstRowLayout.rowHeight);
  });

  it('grows PDF rows when labels, references, or hooks wrap', () => {
    const input = makeTwoHookInput();
    const row = buildMeasurementTableRows(input.measurements, { includeDimensions: true })[0];
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const layout = buildPdfMeasurementRowLayout(doc, row);

    expect(layout.hookLines.length).toBeGreaterThan(1);
    expect(layout.pieceLines.length + layout.sectionLines.length).toBeGreaterThan(2);
    expect(layout.rowHeight).toBeGreaterThan(34);
  });
});

describe('export file helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('preserves aspect ratio when fitting the diagram into a page', () => {
    const fitted = fitWithin(1600, 600, 708, 250);
    expect(fitted.width).toBeCloseTo(666.67, 2);
    expect(fitted.height).toBe(250);
    expect(fitted.width / fitted.height).toBeCloseTo(1600 / 600, 6);
  });

  it('downloads a Blob and delays URL cleanup for Safari', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadBlob(new Blob(['file']), 'gallery-wall-layout.png');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });

  it('rejects oversized PNG sheets with an actionable PDF fallback', async () => {
    await expect(
      renderSvgToPngBlob({ markup: '<svg/>', width: 1600, height: 20_001 }),
    ).rejects.toThrow('Export the PDF instead.');
  });
});
