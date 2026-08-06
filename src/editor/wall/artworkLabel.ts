const LABEL_LINE_HEIGHT_RATIO = 1.15;
const LABEL_WIDTH_RATIO = 0.62;

export function fitArtworkLabel(label: string, widthIn: number, heightIn: number) {
  const padding = Math.min(1.25, Math.max(0.5, Math.min(widthIn, heightIn) * 0.1));
  const availableWidth = Math.max(0.5, widthIn - padding * 2);
  const availableHeight = Math.max(0.5, heightIn - padding * 2);
  const text = label.trim().replace(/\s+/g, ' ') || 'Untitled';
  const fontSizes = [3, 2.5, 2, 1.6];
  const minimumInsideFontSize = 1.6;

  for (const fontSize of fontSizes) {
    const lines = wrapLabelLines(text, availableWidth, fontSize);
    const lineHeight = fontSize * LABEL_LINE_HEIGHT_RATIO;
    if (
      fontSize >= minimumInsideFontSize &&
      lines.length * lineHeight <= availableHeight &&
      lines.every((line) => labelLineFits(line, availableWidth, fontSize))
    ) {
      return { lines, fontSize, padding, placement: 'inside' as const };
    }
  }

  return { lines: [text], fontSize: 1.6, padding, placement: 'outside' as const };
}

export function getArtworkLabelLineHeight(fontSize: number) {
  return fontSize * LABEL_LINE_HEIGHT_RATIO;
}

function wrapLabelLines(label: string, availableWidth: number, fontSize: number): string[] {
  const maxCharacters = Math.max(1, Math.floor(availableWidth / (fontSize * LABEL_WIDTH_RATIO)));
  const lines: string[] = [];

  for (const word of label.split(' ')) {
    const current = lines.at(-1);
    if (!current) {
      lines.push(word);
    } else if (`${current} ${word}`.length <= maxCharacters) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else {
      lines.push(word);
    }
  }

  return lines;
}

function labelLineFits(line: string, availableWidth: number, fontSize: number): boolean {
  return line.length * fontSize * LABEL_WIDTH_RATIO <= availableWidth;
}
