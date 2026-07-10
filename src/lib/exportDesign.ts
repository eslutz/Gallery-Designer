import jsPDF from 'jspdf';
import type { MeasurementInstruction } from '../types';

export async function downloadSvgAsPng(svg: SVGSVGElement, fileName: string): Promise<void> {
  const dataUrl = await svgToPngDataUrl(svg);
  triggerDownload(dataUrl, fileName);
}

export async function downloadPdf(
  svg: SVGSVGElement,
  instructions: MeasurementInstruction[],
  issues: string[],
): Promise<void> {
  const dataUrl = await svgToPngDataUrl(svg);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Gallery Wall Layout', 48, 48);

  doc.addImage(dataUrl, 'PNG', 48, 70, 516, 260);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Installation measurements', 48, 360);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 380;
  for (const instruction of instructions) {
    const line = `${instruction.order}. ${instruction.pieceLabel} (${instruction.sectionName}) - top: ${instruction.topReference.formatted} from ${instruction.topReference.label}; side: ${instruction.sideReference.formatted} from ${instruction.sideReference.label}`;
    doc.text(line, 48, y, { maxWidth: 516 });
    y += 24;

    for (const hook of instruction.hooks) {
      const hookLine = `   ${hook.label}: ${hook.formattedY} down from top, ${hook.formattedX} from ${hook.reference} side`;
      doc.text(hookLine, 48, y, { maxWidth: 516 });
      y += 14;
    }

    if (y > 720) {
      doc.addPage();
      y = 48;
    }
  }

  if (issues.length > 0) {
    doc.setTextColor(170, 62, 43);
    doc.text(`Warnings: ${issues.join(' ')}`, 48, y + 12, { maxWidth: 516 });
  }

  doc.save('gallery-wall-layout.pdf');
}

async function svgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not render the layout image.'));
    image.src = url;
  });

  const rect = svg.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1000, Math.round(rect.width * 2));
  canvas.height = Math.max(600, Math.round(rect.height * 2));
  const context = canvas.getContext('2d');
  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error('Canvas export is not available in this browser.');
  }

  context.fillStyle = '#f8faf7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL('image/png');
}

function triggerDownload(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}
