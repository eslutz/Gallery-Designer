import type jsPDF from 'jspdf';
import type {
  ArtPiece,
  AutoPlacementSettings,
  MeasurementInstruction,
  Placement,
  Unit,
  WallFeature,
  WallSection,
} from '../../types';
import type { ApplicationTheme } from '../../app/appTheme';
import { fitArtworkLabel, getArtworkLabelLineHeight } from '../wall/artworkLabel';
import { getExportPalette, hexToRgb, type ExportPalette } from './exportTheme';
import { getHookPoints } from '../wall/hanging';
import { formatMeasurement } from '../../shared/format/units';
import {
  buildMeasurementTableRows,
  EXPORT_MEASUREMENT_TABLE_HEADERS,
  type MeasurementTableRow,
} from '../measurements/measurementTable';
import { getWallBounds, getWallExteriorEdges, getWallLayout } from '../wall/geometry';
import { resolveWallFeatureRule } from '../wall/features';

const SHEET_WIDTH = 1600;
const SHEET_MARGIN = 72;
const DIAGRAM_WIDTH = SHEET_WIDTH - SHEET_MARGIN * 2;
const DIAGRAM_HEIGHT = 560;
const MAX_CANVAS_AREA = 32_000_000;
const PDF_MARGIN = 42;
const PDF_PAGE_WIDTH = 792;
const PDF_PAGE_HEIGHT = 612;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
const PDF_MEASUREMENT_TITLE_HEIGHT = 20;
const PDF_MEASUREMENT_HEADER_HEIGHT = 22;
const PDF_MEASUREMENT_ROW_GAP = 3;
const SVG_MEASUREMENT_MIN_ROW_HEIGHT = 78;
const SVG_MEASUREMENT_HOOK_MAX_CHARS = 32;
const SVG_MEASUREMENT_HOOK_LINE_HEIGHT = 20;
const SVG_INVENTORY_MIN_ROW_HEIGHT = 40;
const SVG_INVENTORY_TEXT_LINE_HEIGHT = 18;

export interface ExportDesignInput {
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  measurements: MeasurementInstruction[];
  unit: Unit;
  autoPlacementSettings?: AutoPlacementSettings;
  theme?: ApplicationTheme;
}

export interface ExportSheetSvg {
  markup: string;
  width: number;
  height: number;
}

interface InventoryRow {
  order: number;
  piece: ArtPiece;
  placement?: Placement;
  section?: WallSection;
}

interface DiagramSvg {
  markup: string;
  width: number;
  height: number;
}

export interface PdfMeasurementRowLayout {
  rowHeight: number;
  orderLines: string[];
  pieceLines: string[];
  sectionLines: string[];
  dimensionLines: string[];
  topLines: string[];
  sideLines: string[];
  hookLines: string[];
}

export async function downloadPng(
  input: ExportDesignInput,
  fileName = 'gallery-wall-layout.png',
): Promise<void> {
  const sheet = buildExportSheetSvg(input);
  const blob = await renderSvgToPngBlob(sheet);
  downloadBlob(blob, fileName);
}

export async function downloadPdf(
  input: ExportDesignInput,
  fileName = 'gallery-wall-layout.pdf',
): Promise<void> {
  const palette = getExportPalette(input.theme);
  const diagram = buildDiagramSvg(input, 1600, 600, palette);
  const diagramBlob = await renderSvgToPngBlob(diagram);
  const diagramBytes = new Uint8Array(await diagramBlob.arrayBuffer());
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...hexToRgb(palette.textPrimary));
  doc.text('Gallery Wall Installation Sheet', PDF_MARGIN, 38);

  const fittedDiagram = fitWithin(diagram.width, diagram.height, PDF_CONTENT_WIDTH, 250);
  const diagramX = PDF_MARGIN + (PDF_CONTENT_WIDTH - fittedDiagram.width) / 2;
  doc.addImage(diagramBytes, 'PNG', diagramX, 54, fittedDiagram.width, fittedDiagram.height);

  let y = 54 + fittedDiagram.height + 28;
  y = drawPdfInventory(doc, input, y, palette);
  drawPdfMeasurementTable(
    doc,
    buildMeasurementTableRows(input.measurements, { includeDimensions: true }),
    y + 20,
    palette,
  );

  downloadBlob(doc.output('blob'), fileName);
}

export function buildExportSheetSvg(input: ExportDesignInput): ExportSheetSvg {
  const palette = getExportPalette(input.theme);
  const inventoryRows = getInventoryRows(input);
  const inventoryHeight = getSvgInventoryTableHeight(inventoryRows);
  const measurementRows = buildMeasurementTableRows(input.measurements, {
    includeDimensions: true,
  });
  const measurementHeight = getSvgMeasurementTableHeight(measurementRows);
  const diagramY = 132;
  const inventoryY = diagramY + DIAGRAM_HEIGHT + 68;
  const measurementsY = inventoryY + inventoryHeight + 76;
  const height = Math.ceil(measurementsY + measurementHeight + SHEET_MARGIN);
  const diagram = buildDiagramFragment(
    input,
    SHEET_MARGIN,
    diagramY,
    DIAGRAM_WIDTH,
    DIAGRAM_HEIGHT,
    palette,
  );
  const inventory = buildInventorySvg(input, inventoryRows, inventoryY, palette);
  const measurements = buildMeasurementTableSvg(measurementRows, measurementsY, palette);

  return {
    width: SHEET_WIDTH,
    height,
    markup: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${height}" viewBox="0 0 ${SHEET_WIDTH} ${height}">`,
      `<rect x="0" y="0" width="${SHEET_WIDTH}" height="${height}" fill="#ffffff"/>`,
      `<g font-family="Arial, Helvetica, sans-serif" fill="${palette.textPrimary}">`,
      `<text x="${SHEET_MARGIN}" y="72" font-size="38" font-weight="700">Gallery Wall Installation Sheet</text>`,
      `<text x="${SHEET_MARGIN}" y="104" font-size="18" fill="${palette.textSecondary}">Full layout, piece inventory, and hanging measurements</text>`,
      diagram,
      inventory,
      measurements,
      '</g>',
      '</svg>',
    ].join(''),
  };
}

export function fitWithin(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

export async function renderSvgToPngBlob(svg: ExportSheetSvg): Promise<Blob> {
  if (svg.width * svg.height > MAX_CANVAS_AREA) {
    throw new Error('This design is too large for a PNG in this browser. Export the PDF instead.');
  }

  const svgBlob = new Blob([svg.markup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The installation sheet could not be rendered.'));
      image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = svg.width;
    canvas.height = svg.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas export is not available in this browser.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('The browser could not create the PNG file.'));
        }
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function buildDiagramSvg(
  input: ExportDesignInput,
  width: number,
  height: number,
  palette: ExportPalette,
): DiagramSvg {
  return {
    width,
    height,
    markup: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
      `<g font-family="Arial, Helvetica, sans-serif" fill="${palette.textPrimary}">`,
      buildDiagramFragment(input, 0, 0, width, height, palette),
      '</g>',
      '</svg>',
    ].join(''),
  };
}

function buildDiagramFragment(
  input: ExportDesignInput,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: ExportPalette,
): string {
  const bounds = getWallBounds(input.sections);
  const layout = getWallLayout(input.sections);
  const innerPadding = 44;
  const labelSpace = 34;
  const scale = Math.min(
    (width - innerPadding * 2) / Math.max(bounds.width, 1),
    (height - innerPadding * 2 - labelSpace) / Math.max(bounds.height, 1),
  );
  const wallWidth = bounds.width * scale;
  const wallHeight = bounds.height * scale;
  const originX = x + (width - wallWidth) / 2 - bounds.minX * scale;
  const originY = y + labelSpace + (height - labelSpace - wallHeight) / 2 - bounds.minY * scale;
  const orderByPieceId = new Map(
    input.measurements.map((instruction) => [instruction.pieceId, instruction.order]),
  );
  const pieceById = new Map(input.pieces.map((piece) => [piece.id, piece]));
  const sectionById = new Map(input.sections.map((section) => [section.id, section]));
  const sectionOffsets = new Map(
    layout.map(({ section, offsetXIn, offsetYIn }) => [section.id, { x: offsetXIn, y: offsetYIn }]),
  );

  const sectionFillMarkup = layout
    .map(({ section, offsetXIn, offsetYIn }) => {
      const sectionX = originX + offsetXIn * scale;
      const sectionY = originY + offsetYIn * scale;
      const sectionWidth = section.widthIn * scale;
      const sectionHeight = section.heightIn * scale;
      return `<rect x="${number(sectionX)}" y="${number(sectionY)}" width="${number(sectionWidth)}" height="${number(sectionHeight)}" fill="${palette.sectionFill}"/>`;
    })
    .join('');
  const exteriorEdgeMarkup = getWallExteriorEdges(input.sections)
    .map(
      (edge) =>
        `<line x1="${number(originX + edge.x1 * scale)}" y1="${number(originY + edge.y1 * scale)}" x2="${number(originX + edge.x2 * scale)}" y2="${number(originY + edge.y2 * scale)}" stroke="${palette.wallEdge}" stroke-width="3"/>`,
    )
    .join('');
  const sectionLabelMarkup = layout
    .map(({ section, offsetXIn, offsetYIn }) => {
      const sectionX = originX + offsetXIn * scale;
      const sectionY = originY + offsetYIn * scale;
      const label = `${section.name} - ${formatMeasurement(section.widthIn, input.unit)} x ${formatMeasurement(section.heightIn, input.unit)}`;
      return `<text x="${number(sectionX + 14)}" y="${number(sectionY - 10)}" font-size="18" font-weight="700" fill="${palette.headerFill}">${escapeXml(label)}</text>`;
    })
    .join('');
  const featureMarkup =
    input.autoPlacementSettings?.wallSetupMode === 'full-wall-with-features'
      ? input.autoPlacementSettings.wallFeatures
          .filter(isPlacedWallFeature)
          .map((feature) => {
            const rule = resolveWallFeatureRule(feature);
            const featureTop = feature.yIn ?? bounds.maxY - feature.heightIn - rule.clearanceIn;
            const blockedTop =
              typeof feature.yIn === 'number'
                ? Math.max(bounds.minY, featureTop - rule.clearanceIn)
                : featureTop;
            const blockedBottom =
              typeof feature.yIn === 'number' ? featureTop + feature.heightIn : bounds.maxY;
            const blockedHeight = blockedBottom - blockedTop;
            return `<rect x="${number(originX + feature.xIn * scale)}" y="${number(originY + blockedTop * scale)}" width="${number(feature.widthIn * scale)}" height="${number(blockedHeight * scale)}" fill="${palette.featureBlockedFill}" fill-opacity="0.62" stroke="${palette.featureStroke}" stroke-width="2" stroke-dasharray="8 8"><title>${escapeXml(feature.name)} blocked area</title></rect><rect x="${number(originX + feature.xIn * scale)}" y="${number(originY + featureTop * scale)}" width="${number(feature.widthIn * scale)}" height="${number(feature.heightIn * scale)}" fill="${palette.featureFill}" fill-opacity="0.5" stroke="${palette.featureStroke}" stroke-width="2"><title>${escapeXml(feature.name)}</title></rect>`;
          })
          .join('')
      : '';

  const placementMarkup = input.placements
    .map((placement, index) => {
      const piece = pieceById.get(placement.pieceId);
      const section = sectionById.get(placement.sectionId);
      const offset = sectionOffsets.get(placement.sectionId);
      if (!piece || !section || !offset) {
        return '';
      }
      const pieceX = originX + (offset.x + placement.xIn) * scale;
      const pieceY = originY + (offset.y + placement.yIn) * scale;
      const pieceWidth = piece.widthIn * scale;
      const pieceHeight = piece.heightIn * scale;
      const clipId = `export-piece-${index}`;
      const order = orderByPieceId.get(piece.id);
      const title = order ? `${order}. ${piece.label}` : piece.label;
      // Mirrors the interactive canvas's own label fitting (fitArtworkLabel):
      // word-wrap only, never breaking a word mid-string, falling back to an
      // unclipped label below the box when nothing fits inside it.
      const label = fitArtworkLabel(title, piece.widthIn, piece.heightIn);
      const lineHeightPx = getArtworkLabelLineHeight(label.fontSize) * scale;
      const fontSizePx = label.fontSize * scale;
      const labelCenterX = pieceX + pieceWidth / 2;
      const labelCenterY =
        label.placement === 'inside'
          ? pieceY + pieceHeight / 2
          : pieceY + pieceHeight + lineHeightPx;
      const labelMarkup = buildCenteredMultilineText(
        label.lines,
        labelCenterX,
        labelCenterY,
        fontSizePx,
        lineHeightPx,
        palette.textPrimary,
      );
      const hooks = getHookPoints(piece)
        .map(
          (hook) =>
            `<circle cx="${number(pieceX + hook.xIn * scale)}" cy="${number(pieceY + hook.yIn * scale)}" r="4" fill="${palette.hookFill}" stroke="${palette.hookStroke}" stroke-width="2"/>`,
        )
        .join('');
      return [
        label.placement === 'inside'
          ? `<defs><clipPath id="${clipId}"><rect x="${number(pieceX + 3)}" y="${number(pieceY + 3)}" width="${number(Math.max(0, pieceWidth - 6))}" height="${number(Math.max(0, pieceHeight - 6))}"/></clipPath></defs>`
          : '',
        `<rect x="${number(pieceX)}" y="${number(pieceY)}" width="${number(pieceWidth)}" height="${number(pieceHeight)}" rx="5" fill="${palette.pieceFill}" stroke="${palette.pieceStroke}" stroke-width="3"/>`,
        label.placement === 'inside' ? `<g clip-path="url(#${clipId})">` : '',
        labelMarkup,
        label.placement === 'inside' ? '</g>' : '',
        hooks,
      ].join('');
    })
    .join('');

  return [
    `<rect x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}" rx="16" fill="${palette.panelBackground}" stroke="${palette.panelBorder}" stroke-width="2"/>`,
    sectionFillMarkup,
    exteriorEdgeMarkup,
    sectionLabelMarkup,
    featureMarkup,
    placementMarkup,
  ].join('');
}

function buildCenteredMultilineText(
  lines: string[],
  cx: number,
  cy: number,
  fontSize: number,
  lineHeight: number,
  fill: string,
): string {
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${number(cx)}" y="${number(startY + index * lineHeight)}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  return `<text text-anchor="middle" dominant-baseline="middle" font-size="${number(fontSize)}" font-weight="700" fill="${fill}">${tspans}</text>`;
}

function buildInventorySvg(
  input: ExportDesignInput,
  rows: InventoryRow[],
  startY: number,
  palette: ExportPalette,
): string {
  const tableX = SHEET_MARGIN;
  const tableWidth = SHEET_WIDTH - SHEET_MARGIN * 2;
  const headerY = startY + 46;
  const columnX = [tableX + 18, tableX + 105, tableX + 650, tableX + 1080];
  const columnCharWidths = [8, 54, 42, 18];
  const headings = ['Order', 'Piece', 'Section', 'Size'];
  const headerText = headings
    .map(
      (heading, index) =>
        `<text x="${columnX[index]}" y="${headerY + 32}" font-size="17" font-weight="700" fill="${palette.headerText}">${heading}</text>`,
    )
    .join('');
  let nextRowY = headerY + 46;
  const body = rows
    .map((row, index) => {
      const rowY = nextRowY;
      const rowHeight = getSvgInventoryRowHeight(row);
      nextRowY += rowHeight;
      const fill = index % 2 === 0 ? palette.rowFillA : palette.rowFillB;
      const size = `${formatMeasurement(row.piece.widthIn, input.unit)} x ${formatMeasurement(row.piece.heightIn, input.unit)}`;
      const values = [String(row.order), row.piece.label, row.section?.name ?? 'Not placed', size];
      return [
        `<rect x="${tableX}" y="${rowY}" width="${tableWidth}" height="${rowHeight}" fill="${fill}" stroke="${palette.tableBorder}" stroke-width="1"/>`,
        ...values.map((value, valueIndex) =>
          buildSvgMultilineText(
            wrapExportText(value, columnCharWidths[valueIndex]),
            columnX[valueIndex],
            rowY + 24,
            16,
            SVG_INVENTORY_TEXT_LINE_HEIGHT,
            palette.textPrimary,
          ),
        ),
      ].join('');
    })
    .join('');

  return [
    `<text x="${tableX}" y="${startY}" font-size="28" font-weight="700">Piece inventory</text>`,
    `<rect x="${tableX}" y="${headerY}" width="${tableWidth}" height="46" rx="8" fill="${palette.headerFill}"/>`,
    headerText,
    body,
  ].join('');
}

function getSvgInventoryTableHeight(rows: InventoryRow[]): number {
  return 92 + rows.reduce((total, row) => total + getSvgInventoryRowHeight(row), 0);
}

function getSvgInventoryRowHeight(row: InventoryRow): number {
  const lineCounts = [
    wrapExportText(String(row.order), 8).length,
    wrapExportText(row.piece.label, 54).length,
    wrapExportText(row.section?.name ?? 'Not placed', 42).length,
    1,
  ];
  return Math.max(
    SVG_INVENTORY_MIN_ROW_HEIGHT,
    16 + Math.max(...lineCounts) * SVG_INVENTORY_TEXT_LINE_HEIGHT,
  );
}

function buildMeasurementTableSvg(
  rows: MeasurementTableRow[],
  startY: number,
  palette: ExportPalette,
): string {
  const tableX = SHEET_MARGIN;
  const tableWidth = SHEET_WIDTH - SHEET_MARGIN * 2;
  const headerY = startY + 46;
  const columnX = [tableX + 18, tableX + 105, tableX + 430, tableX + 650, tableX + 1120];
  let nextRowY = headerY + 46;
  const body = rows
    .map((row, index) => {
      const rowY = nextRowY;
      const rowHeight = getSvgMeasurementRowHeight(row);
      const hookLines = wrapSvgHookLines(row);
      nextRowY += rowHeight;
      const fill = index % 2 === 0 ? palette.rowFillA : palette.rowFillB;
      return [
        `<rect x="${tableX}" y="${rowY}" width="${tableWidth}" height="${rowHeight}" fill="${fill}" stroke="${palette.tableBorder}" stroke-width="1"/>`,
        `<text x="${columnX[0]}" y="${rowY + 33}" font-size="17" fill="${palette.textPrimary}">${escapeXml(String(row.order))}</text>`,
        `<text x="${columnX[1]}" y="${rowY + 30}" font-size="17" font-weight="700" fill="${palette.textPrimary}">${escapeXml(row.pieceLabel)}</text>`,
        `<text x="${columnX[1]}" y="${rowY + 54}" font-size="15" fill="${palette.textSecondary}">${escapeXml(row.sectionName)}</text>`,
        `<text x="${columnX[2]}" y="${rowY + 42}" font-size="16" fill="${palette.textPrimary}">${escapeXml(row.dimensions ?? '')}</text>`,
        `<text x="${columnX[3]}" y="${rowY + 30}" font-size="16" fill="${palette.textPrimary}">${escapeXml(`Top: ${row.topReference}`)}</text>`,
        `<text x="${columnX[3]}" y="${rowY + 56}" font-size="16" fill="${palette.textPrimary}">${escapeXml(`Side: ${row.sideReference}`)}</text>`,
        buildSvgMultilineText(
          hookLines,
          columnX[4],
          rowY + 28,
          16,
          SVG_MEASUREMENT_HOOK_LINE_HEIGHT,
          palette.textSecondary,
        ),
      ].join('');
    })
    .join('');

  return [
    `<text x="${SHEET_MARGIN}" y="${startY}" font-size="28" font-weight="700">Installation measurements</text>`,
    `<rect x="${tableX}" y="${headerY}" width="${tableWidth}" height="46" rx="8" fill="${palette.headerFill}"/>`,
    ...EXPORT_MEASUREMENT_TABLE_HEADERS.map(
      (header, index) =>
        `<text x="${columnX[index]}" y="${headerY + 32}" font-size="17" font-weight="700" fill="${palette.headerText}">${header}</text>`,
    ),
    body,
  ].join('');
}

export function getSvgMeasurementTableHeight(rows: MeasurementTableRow[]): number {
  return 92 + rows.reduce((total, row) => total + getSvgMeasurementRowHeight(row), 0);
}

export function getSvgMeasurementRowHeight(row: MeasurementTableRow): number {
  const hookLineCount = wrapSvgHookLines(row).length;
  return Math.max(
    SVG_MEASUREMENT_MIN_ROW_HEIGHT,
    34 + hookLineCount * SVG_MEASUREMENT_HOOK_LINE_HEIGHT,
  );
}

// One numbered "Hook N: ..." line per hook, further wrapped for width —
// mirrors the "Hook N:" labeling used in the interactive table.
function wrapSvgHookLines(row: MeasurementTableRow): string[] {
  return labelHookLines(row.hooks).flatMap((line) =>
    wrapExportText(line, SVG_MEASUREMENT_HOOK_MAX_CHARS),
  );
}

function labelHookLines(hooks: string[]): string[] {
  return hooks.length === 0
    ? ['No hook data']
    : hooks.map((line, index) => `Hook ${index + 1}: ${line}`);
}

export function wrapExportText(value: string, maxCharacters: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > maxCharacters && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function buildSvgMultilineText(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  fill: string,
): string {
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  return `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${fill}">${tspans}</text>`;
}

function getInventoryRows(input: ExportDesignInput): InventoryRow[] {
  const pieceById = new Map(input.pieces.map((piece) => [piece.id, piece]));
  const placementByPieceId = new Map(
    input.placements.map((placement) => [placement.pieceId, placement]),
  );
  const sectionById = new Map(input.sections.map((section) => [section.id, section]));
  const orderedIds = [
    ...input.measurements.map((instruction) => instruction.pieceId),
    ...input.pieces
      .map((piece) => piece.id)
      .filter((pieceId) => !input.measurements.some((item) => item.pieceId === pieceId)),
  ];

  return orderedIds.flatMap((pieceId, index) => {
    const piece = pieceById.get(pieceId);
    if (!piece) {
      return [];
    }
    const placement = placementByPieceId.get(pieceId);
    return [
      {
        order: input.measurements.find((item) => item.pieceId === pieceId)?.order ?? index + 1,
        piece,
        placement,
        section: placement ? sectionById.get(placement.sectionId) : undefined,
      },
    ];
  });
}

function drawPdfInventory(
  doc: jsPDF,
  input: ExportDesignInput,
  startY: number,
  palette: ExportPalette,
): number {
  let y = ensurePdfSpace(doc, startY, 46);
  const textColor = hexToRgb(palette.textPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...textColor);
  doc.text('Piece inventory', PDF_MARGIN, y);
  y += 18;
  y = drawPdfInventoryHeader(doc, y, palette);

  for (const row of getInventoryRows(input)) {
    if (y + 19 > PDF_PAGE_HEIGHT - PDF_MARGIN) {
      doc.addPage('letter', 'landscape');
      y = drawPdfInventoryHeader(doc, PDF_MARGIN, palette);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...textColor);
    doc.text(String(row.order), PDF_MARGIN + 6, y + 14);
    doc.text(row.piece.label, PDF_MARGIN + 48, y + 14, { maxWidth: 170 });
    doc.text(row.section?.name ?? 'Not placed', PDF_MARGIN + 260, y + 14, { maxWidth: 200 });
    doc.text(
      `${formatMeasurement(row.piece.widthIn, input.unit)} x ${formatMeasurement(row.piece.heightIn, input.unit)}`,
      PDF_MARGIN + 520,
      y + 14,
    );
    doc.setDrawColor(...hexToRgb(palette.tableBorder));
    doc.line(PDF_MARGIN, y + 18, PDF_PAGE_WIDTH - PDF_MARGIN, y + 18);
    y += 19;
  }
  return y;
}

function drawPdfInventoryHeader(doc: jsPDF, y: number, palette: ExportPalette): number {
  doc.setFillColor(...hexToRgb(palette.headerFill));
  doc.rect(PDF_MARGIN, y, PDF_CONTENT_WIDTH, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(palette.headerText));
  doc.text('Order', PDF_MARGIN + 6, y + 14);
  doc.text('Piece', PDF_MARGIN + 48, y + 14);
  doc.text('Section', PDF_MARGIN + 260, y + 14);
  doc.text('Size', PDF_MARGIN + 520, y + 14);
  return y + 22;
}

function drawPdfMeasurementTable(
  doc: jsPDF,
  rows: MeasurementTableRow[],
  startY: number,
  palette: ExportPalette,
): void {
  let y = ensurePdfSpace(doc, startY, getPdfMeasurementInitialRequiredHeight(doc, rows));
  const textColor = hexToRgb(palette.textPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...textColor);
  doc.text('Installation measurements', PDF_MARGIN, y);
  y += PDF_MEASUREMENT_TITLE_HEIGHT;
  y = drawPdfMeasurementHeader(doc, y, palette);

  for (const row of rows) {
    const layout = buildPdfMeasurementRowLayout(doc, row);
    if (y + layout.rowHeight > PDF_PAGE_HEIGHT - PDF_MARGIN) {
      doc.addPage('letter', 'landscape');
      y = drawPdfMeasurementHeader(doc, PDF_MARGIN, palette);
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textColor);
    doc.setFontSize(8.5);
    drawPdfLines(doc, layout.orderLines, PDF_MARGIN + 6, y + 12);
    doc.setFont('helvetica', 'bold');
    drawPdfLines(doc, layout.pieceLines, PDF_MARGIN + 48, y + 12);
    doc.setFont('helvetica', 'normal');
    drawPdfLines(doc, layout.sectionLines, PDF_MARGIN + 48, y + 12 + layout.pieceLines.length * 10);
    drawPdfLines(doc, layout.dimensionLines, PDF_MARGIN + 210, y + 12);
    drawPdfLines(doc, layout.topLines, PDF_MARGIN + 300, y + 12);
    drawPdfLines(doc, layout.sideLines, PDF_MARGIN + 300, y + 12 + layout.topLines.length * 10);
    drawPdfLines(doc, layout.hookLines, PDF_MARGIN + 555, y + 12);
    doc.setDrawColor(...hexToRgb(palette.tableBorder));
    doc.line(PDF_MARGIN, y + layout.rowHeight, PDF_PAGE_WIDTH - PDF_MARGIN, y + layout.rowHeight);
    y += layout.rowHeight + PDF_MEASUREMENT_ROW_GAP;
  }
}

function drawPdfMeasurementHeader(doc: jsPDF, y: number, palette: ExportPalette): number {
  doc.setFillColor(...hexToRgb(palette.headerFill));
  doc.rect(PDF_MARGIN, y, PDF_CONTENT_WIDTH, PDF_MEASUREMENT_HEADER_HEIGHT, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...hexToRgb(palette.headerText));
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[0], PDF_MARGIN + 6, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[1], PDF_MARGIN + 48, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[2], PDF_MARGIN + 210, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[3], PDF_MARGIN + 300, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[4], PDF_MARGIN + 555, y + 14);
  return y + PDF_MEASUREMENT_HEADER_HEIGHT;
}

export function getPdfMeasurementInitialRequiredHeight(
  doc: jsPDF,
  rows: MeasurementTableRow[],
): number {
  const firstRowHeight = rows[0] ? buildPdfMeasurementRowLayout(doc, rows[0]).rowHeight : 0;
  return PDF_MEASUREMENT_TITLE_HEIGHT + PDF_MEASUREMENT_HEADER_HEIGHT + firstRowHeight;
}

export function buildPdfMeasurementRowLayout(
  doc: jsPDF,
  row: MeasurementTableRow,
): PdfMeasurementRowLayout {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const orderLines = splitPdfText(doc, String(row.order), 28);
  const pieceLines = splitPdfText(doc, row.pieceLabel, 150);
  const sectionLines = splitPdfText(doc, row.sectionName, 150);
  const dimensionLines = splitPdfText(doc, row.dimensions ?? '', 80);
  const topLines = splitPdfText(doc, `Top: ${row.topReference}`, 245);
  const sideLines = splitPdfText(doc, `Side: ${row.sideReference}`, 245);
  const hookLines = labelHookLines(row.hooks).flatMap((line) => splitPdfText(doc, line, 145));
  const lineHeight = 10;
  const rowContentHeight =
    12 +
    Math.max(
      orderLines.length * lineHeight,
      (pieceLines.length + sectionLines.length) * lineHeight,
      dimensionLines.length * lineHeight,
      (topLines.length + sideLines.length) * lineHeight,
      hookLines.length * lineHeight,
    );

  return {
    rowHeight: Math.max(34, rowContentHeight),
    orderLines,
    pieceLines,
    sectionLines,
    dimensionLines,
    topLines,
    sideLines,
    hookLines,
  };
}

function isPlacedWallFeature(feature: WallFeature): boolean {
  return feature.placed !== false;
}

function splitPdfText(doc: jsPDF, value: string, maxWidth: number): string[] {
  const lines = doc.splitTextToSize(value, maxWidth);
  return Array.isArray(lines) ? lines : [lines];
}

function drawPdfLines(doc: jsPDF, lines: string[], x: number, y: number): void {
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * 10);
  });
}

function ensurePdfSpace(doc: jsPDF, y: number, requiredHeight: number): number {
  if (y + requiredHeight <= PDF_PAGE_HEIGHT - PDF_MARGIN) {
    return y;
  }
  doc.addPage('letter', 'landscape');
  return PDF_MARGIN;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function number(value: number): string {
  return Number(value.toFixed(2)).toString();
}
