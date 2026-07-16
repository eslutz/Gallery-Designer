import jsPDF from 'jspdf';
import type { ArtPiece, MeasurementInstruction, Placement, Unit, WallSection } from '../types';
import { getHookPoints } from './hooks';
import { formatMeasurement } from './units';
import {
  buildMeasurementTableRows,
  EXPORT_MEASUREMENT_TABLE_HEADERS,
  type MeasurementTableRow,
} from './measurementTable';
import { getWallBounds, getWallExteriorEdges, getWallLayout } from './wall';

const SHEET_WIDTH = 1600;
const SHEET_MARGIN = 72;
const DIAGRAM_WIDTH = SHEET_WIDTH - SHEET_MARGIN * 2;
const DIAGRAM_HEIGHT = 560;
const MAX_CANVAS_AREA = 32_000_000;
const PDF_MARGIN = 42;
const PDF_PAGE_WIDTH = 792;
const PDF_PAGE_HEIGHT = 612;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;

export interface ExportDesignInput {
  sections: WallSection[];
  pieces: ArtPiece[];
  placements: Placement[];
  measurements: MeasurementInstruction[];
  unit: Unit;
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
  const diagram = buildDiagramSvg(input, 1600, 600);
  const diagramBlob = await renderSvgToPngBlob(diagram);
  const diagramBytes = new Uint8Array(await diagramBlob.arrayBuffer());
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(28, 37, 46);
  doc.text('Gallery Wall Installation Sheet', PDF_MARGIN, 38);

  const fittedDiagram = fitWithin(diagram.width, diagram.height, PDF_CONTENT_WIDTH, 250);
  const diagramX = PDF_MARGIN + (PDF_CONTENT_WIDTH - fittedDiagram.width) / 2;
  doc.addImage(diagramBytes, 'PNG', diagramX, 54, fittedDiagram.width, fittedDiagram.height);

  let y = 54 + fittedDiagram.height + 28;
  y = drawPdfInventory(doc, input, y);
  drawPdfMeasurementTable(
    doc,
    buildMeasurementTableRows(input.measurements, { includeDimensions: true }),
    y + 20,
  );

  downloadBlob(doc.output('blob'), fileName);
}

export function buildExportSheetSvg(input: ExportDesignInput): ExportSheetSvg {
  const inventoryRows = getInventoryRows(input);
  const inventoryRowHeight = 40;
  const inventoryHeight = 52 + inventoryRows.length * inventoryRowHeight;
  const measurementRows = buildMeasurementTableRows(input.measurements, {
    includeDimensions: true,
  });
  const measurementHeight = 52 + measurementRows.length * 78;
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
  );
  const inventory = buildInventorySvg(input, inventoryRows, inventoryY);
  const measurements = buildMeasurementTableSvg(measurementRows, measurementsY);

  return {
    width: SHEET_WIDTH,
    height,
    markup: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${height}" viewBox="0 0 ${SHEET_WIDTH} ${height}">`,
      `<rect x="0" y="0" width="${SHEET_WIDTH}" height="${height}" fill="#ffffff"/>`,
      '<g font-family="Arial, Helvetica, sans-serif" fill="#1c252e">',
      `<text x="${SHEET_MARGIN}" y="72" font-size="38" font-weight="700">Gallery Wall Installation Sheet</text>`,
      `<text x="${SHEET_MARGIN}" y="104" font-size="18" fill="#566472">Full layout, piece inventory, and hanging measurements</text>`,
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

function buildDiagramSvg(input: ExportDesignInput, width: number, height: number): DiagramSvg {
  return {
    width,
    height,
    markup: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
      '<g font-family="Arial, Helvetica, sans-serif" fill="#1c252e">',
      buildDiagramFragment(input, 0, 0, width, height),
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
      return `<rect x="${number(sectionX)}" y="${number(sectionY)}" width="${number(sectionWidth)}" height="${number(sectionHeight)}" fill="#f4f6f5"/>`;
    })
    .join('');
  const exteriorEdgeMarkup = getWallExteriorEdges(input.sections)
    .map(
      (edge) =>
        `<line x1="${number(originX + edge.x1 * scale)}" y1="${number(originY + edge.y1 * scale)}" x2="${number(originX + edge.x2 * scale)}" y2="${number(originY + edge.y2 * scale)}" stroke="#607080" stroke-width="3"/>`,
    )
    .join('');
  const sectionLabelMarkup = layout
    .map(({ section, offsetXIn, offsetYIn }) => {
      const sectionX = originX + offsetXIn * scale;
      const sectionY = originY + offsetYIn * scale;
      const label = `${section.name} - ${formatMeasurement(section.widthIn, input.unit)} x ${formatMeasurement(section.heightIn, input.unit)}`;
      return `<text x="${number(sectionX + 14)}" y="${number(sectionY - 10)}" font-size="18" font-weight="700" fill="#344454">${escapeXml(label)}</text>`;
    })
    .join('');

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
      const fontSize = Math.max(11, Math.min(20, pieceWidth / 8, pieceHeight / 4));
      const order = orderByPieceId.get(piece.id);
      const title = order ? `${order}. ${piece.label}` : piece.label;
      const hooks = getHookPoints(piece)
        .map(
          (hook) =>
            `<circle cx="${number(pieceX + hook.xIn * scale)}" cy="${number(pieceY + hook.yIn * scale)}" r="4" fill="#ffffff" stroke="#1c252e" stroke-width="2"/>`,
        )
        .join('');
      return [
        `<defs><clipPath id="${clipId}"><rect x="${number(pieceX + 3)}" y="${number(pieceY + 3)}" width="${number(Math.max(0, pieceWidth - 6))}" height="${number(Math.max(0, pieceHeight - 6))}"/></clipPath></defs>`,
        `<rect x="${number(pieceX)}" y="${number(pieceY)}" width="${number(pieceWidth)}" height="${number(pieceHeight)}" rx="5" fill="#d8e0e5" stroke="#1c252e" stroke-width="3"/>`,
        `<g clip-path="url(#${clipId})">`,
        `<text x="${number(pieceX + pieceWidth / 2)}" y="${number(pieceY + pieceHeight / 2)}" text-anchor="middle" dominant-baseline="middle" font-size="${number(fontSize)}" font-weight="700" fill="#1c252e">${escapeXml(title)}</text>`,
        '</g>',
        hooks,
      ].join('');
    })
    .join('');

  return [
    `<rect x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}" rx="16" fill="#f8faf9" stroke="#c9d1d8" stroke-width="2"/>`,
    sectionFillMarkup,
    exteriorEdgeMarkup,
    sectionLabelMarkup,
    placementMarkup,
  ].join('');
}

function buildInventorySvg(input: ExportDesignInput, rows: InventoryRow[], startY: number): string {
  const tableX = SHEET_MARGIN;
  const tableWidth = SHEET_WIDTH - SHEET_MARGIN * 2;
  const headerY = startY + 46;
  const rowHeight = 40;
  const columnX = [tableX + 18, tableX + 105, tableX + 650, tableX + 1080];
  const headings = ['Order', 'Piece', 'Section', 'Size'];
  const headerText = headings
    .map(
      (heading, index) =>
        `<text x="${columnX[index]}" y="${headerY + 32}" font-size="17" font-weight="700" fill="#ffffff">${heading}</text>`,
    )
    .join('');
  const body = rows
    .map((row, index) => {
      const rowY = headerY + 46 + index * rowHeight;
      const fill = index % 2 === 0 ? '#f8faf9' : '#eef2f3';
      const size = `${formatMeasurement(row.piece.widthIn, input.unit)} x ${formatMeasurement(row.piece.heightIn, input.unit)}`;
      const values = [String(row.order), row.piece.label, row.section?.name ?? 'Not placed', size];
      return [
        `<rect x="${tableX}" y="${rowY}" width="${tableWidth}" height="${rowHeight}" fill="${fill}" stroke="#d4dbe0" stroke-width="1"/>`,
        ...values.map(
          (value, valueIndex) =>
            `<text x="${columnX[valueIndex]}" y="${rowY + 26}" font-size="16" fill="#1c252e">${escapeXml(value)}</text>`,
        ),
      ].join('');
    })
    .join('');

  return [
    `<text x="${tableX}" y="${startY}" font-size="28" font-weight="700">Piece inventory</text>`,
    `<rect x="${tableX}" y="${headerY}" width="${tableWidth}" height="46" rx="8" fill="#344454"/>`,
    headerText,
    body,
  ].join('');
}

function buildMeasurementTableSvg(rows: MeasurementTableRow[], startY: number): string {
  const tableX = SHEET_MARGIN;
  const tableWidth = SHEET_WIDTH - SHEET_MARGIN * 2;
  const headerY = startY + 46;
  const rowHeight = 78;
  const columnX = [tableX + 18, tableX + 105, tableX + 430, tableX + 650, tableX + 1120];
  const body = rows
    .map((row, index) => {
      const rowY = headerY + 46 + index * rowHeight;
      const fill = index % 2 === 0 ? '#f8faf9' : '#eef2f3';
      return [
        `<rect x="${tableX}" y="${rowY}" width="${tableWidth}" height="${rowHeight}" fill="${fill}" stroke="#d4dbe0" stroke-width="1"/>`,
        `<text x="${columnX[0]}" y="${rowY + 33}" font-size="17" fill="#1c252e">${escapeXml(String(row.order))}</text>`,
        `<text x="${columnX[1]}" y="${rowY + 30}" font-size="17" font-weight="700" fill="#1c252e">${escapeXml(row.pieceLabel)}</text>`,
        `<text x="${columnX[1]}" y="${rowY + 54}" font-size="15" fill="#566472">${escapeXml(row.sectionName)}</text>`,
        `<text x="${columnX[2]}" y="${rowY + 42}" font-size="16" fill="#1c252e">${escapeXml(row.dimensions ?? '')}</text>`,
        `<text x="${columnX[3]}" y="${rowY + 30}" font-size="16" fill="#1c252e">${escapeXml(`Top: ${row.topReference}`)}</text>`,
        `<text x="${columnX[3]}" y="${rowY + 56}" font-size="16" fill="#1c252e">${escapeXml(`Side: ${row.sideReference}`)}</text>`,
        `<text x="${columnX[4]}" y="${rowY + 42}" font-size="16" fill="#566472">${escapeXml(row.hooks)}</text>`,
      ].join('');
    })
    .join('');

  return [
    `<text x="${SHEET_MARGIN}" y="${startY}" font-size="28" font-weight="700">Installation measurements</text>`,
    `<rect x="${tableX}" y="${headerY}" width="${tableWidth}" height="46" rx="8" fill="#344454"/>`,
    ...EXPORT_MEASUREMENT_TABLE_HEADERS.map(
      (header, index) =>
        `<text x="${columnX[index]}" y="${headerY + 32}" font-size="17" font-weight="700" fill="#ffffff">${header}</text>`,
    ),
    body,
  ].join('');
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

function drawPdfInventory(doc: jsPDF, input: ExportDesignInput, startY: number): number {
  let y = ensurePdfSpace(doc, startY, 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(28, 37, 46);
  doc.text('Piece inventory', PDF_MARGIN, y);
  y += 18;
  y = drawPdfInventoryHeader(doc, y);

  for (const row of getInventoryRows(input)) {
    if (y + 19 > PDF_PAGE_HEIGHT - PDF_MARGIN) {
      doc.addPage('letter', 'landscape');
      y = drawPdfInventoryHeader(doc, PDF_MARGIN);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(28, 37, 46);
    doc.text(String(row.order), PDF_MARGIN + 6, y + 14);
    doc.text(row.piece.label, PDF_MARGIN + 48, y + 14, { maxWidth: 170 });
    doc.text(row.section?.name ?? 'Not placed', PDF_MARGIN + 260, y + 14, { maxWidth: 200 });
    doc.text(
      `${formatMeasurement(row.piece.widthIn, input.unit)} x ${formatMeasurement(row.piece.heightIn, input.unit)}`,
      PDF_MARGIN + 520,
      y + 14,
    );
    doc.setDrawColor(212, 219, 224);
    doc.line(PDF_MARGIN, y + 18, PDF_PAGE_WIDTH - PDF_MARGIN, y + 18);
    y += 19;
  }
  return y;
}

function drawPdfInventoryHeader(doc: jsPDF, y: number): number {
  doc.setFillColor(52, 68, 84);
  doc.rect(PDF_MARGIN, y, PDF_CONTENT_WIDTH, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Order', PDF_MARGIN + 6, y + 14);
  doc.text('Piece', PDF_MARGIN + 48, y + 14);
  doc.text('Section', PDF_MARGIN + 260, y + 14);
  doc.text('Size', PDF_MARGIN + 520, y + 14);
  return y + 22;
}

function drawPdfMeasurementTable(doc: jsPDF, rows: MeasurementTableRow[], startY: number): void {
  let y = ensurePdfSpace(doc, startY, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(28, 37, 46);
  doc.text('Installation measurements', PDF_MARGIN, y);
  y += 20;

  doc.setFillColor(52, 68, 84);
  doc.rect(PDF_MARGIN, y, PDF_CONTENT_WIDTH, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[0], PDF_MARGIN + 6, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[1], PDF_MARGIN + 48, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[2], PDF_MARGIN + 210, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[3], PDF_MARGIN + 300, y + 14);
  doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[4], PDF_MARGIN + 555, y + 14);
  y += 22;

  for (const row of rows) {
    const rowHeight = 34;
    if (y + rowHeight > PDF_PAGE_HEIGHT - PDF_MARGIN) {
      doc.addPage('letter', 'landscape');
      y = PDF_MARGIN;
      doc.setFillColor(52, 68, 84);
      doc.rect(PDF_MARGIN, y, PDF_CONTENT_WIDTH, 22, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[0], PDF_MARGIN + 6, y + 14);
      doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[1], PDF_MARGIN + 48, y + 14);
      doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[2], PDF_MARGIN + 210, y + 14);
      doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[3], PDF_MARGIN + 300, y + 14);
      doc.text(EXPORT_MEASUREMENT_TABLE_HEADERS[4], PDF_MARGIN + 555, y + 14);
      y += 22;
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(28, 37, 46);
    doc.setFontSize(8.5);
    doc.text(String(row.order), PDF_MARGIN + 6, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(row.pieceLabel, PDF_MARGIN + 48, y + 12, { maxWidth: 170 });
    doc.setFont('helvetica', 'normal');
    doc.text(row.sectionName, PDF_MARGIN + 48, y + 25, { maxWidth: 170 });
    doc.text(row.dimensions ?? '', PDF_MARGIN + 210, y + 18, { maxWidth: 80 });
    doc.text(`Top: ${row.topReference}`, PDF_MARGIN + 300, y + 12, { maxWidth: 245 });
    doc.text(`Side: ${row.sideReference}`, PDF_MARGIN + 300, y + 25, { maxWidth: 245 });
    doc.text(row.hooks, PDF_MARGIN + 555, y + 18, { maxWidth: 145 });
    doc.setDrawColor(212, 219, 224);
    doc.line(PDF_MARGIN, y + rowHeight, PDF_PAGE_WIDTH - PDF_MARGIN, y + rowHeight);
    y += rowHeight + 3;
  }
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
