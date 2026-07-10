import type { EditorFeatures, WallSection, WallSectionLayout } from '../types';
import { roundToPrecision } from './units';

interface WallRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface WallBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const MIN_SHARED_EDGE_IN = 0.125;

export interface WallEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WallPath {
  points: Array<{ x: number; y: number }>;
}

export function normalizeWallSections(sections: WallSection[]): WallSection[] {
  let nextXIn = 0;
  return sections.map((section) => {
    const normalized = {
      ...section,
      xIn: section.xIn ?? nextXIn,
      yIn: section.yIn ?? 0,
    };
    nextXIn = normalized.xIn + section.widthIn;
    return normalized;
  });
}

export function getWallLayout(sections: WallSection[]): WallSectionLayout[] {
  return normalizeWallSections(sections).map((section) => ({
    section,
    offsetXIn: section.xIn ?? 0,
    offsetYIn: section.yIn ?? 0,
  }));
}

export function getSectionById(
  sections: WallSection[],
  sectionId: string,
): WallSection | undefined {
  return sections.find((section) => section.id === sectionId);
}

export function getSectionOffsetX(sections: WallSection[], sectionId: string): number {
  return getWallLayout(sections).find((layout) => layout.section.id === sectionId)?.offsetXIn ?? 0;
}

export function getSectionOffsetY(sections: WallSection[], sectionId: string): number {
  return getWallLayout(sections).find((layout) => layout.section.id === sectionId)?.offsetYIn ?? 0;
}

export function getTotalWallWidth(sections: WallSection[]): number {
  return getWallBounds(sections).width;
}

export function getMaxWallHeight(sections: WallSection[]): number {
  return Math.max(getWallBounds(sections).height, 1);
}

export function getWallBounds(sections: WallSection[]): WallBounds {
  const normalized = normalizeWallSections(sections);
  if (normalized.length === 0) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  }

  const rects = normalized.map(rectForSection);
  const minX = Math.min(...rects.map((rect) => rect.left));
  const minY = Math.min(...rects.map((rect) => rect.top));
  const maxX = Math.max(...rects.map((rect) => rect.right));
  const maxY = Math.max(...rects.map((rect) => rect.bottom));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function sectionsShareEdge(first: WallSection, second: WallSection): boolean {
  const firstRect = rectForSection(normalizeWallSections([first])[0]);
  const secondRect = rectForSection(normalizeWallSections([second])[0]);

  const shareVerticalEdge =
    nearlyEqual(firstRect.right, secondRect.left) || nearlyEqual(secondRect.right, firstRect.left);
  const verticalOverlap =
    Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);

  const shareHorizontalEdge =
    nearlyEqual(firstRect.bottom, secondRect.top) || nearlyEqual(secondRect.bottom, firstRect.top);
  const horizontalOverlap =
    Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);

  return (
    (shareVerticalEdge && verticalOverlap >= MIN_SHARED_EDGE_IN) ||
    (shareHorizontalEdge && horizontalOverlap >= MIN_SHARED_EDGE_IN)
  );
}

export function moveWallSection(
  sections: WallSection[],
  sectionId: string,
  proposed: { xIn: number; yIn: number },
): WallSection[] {
  const normalized = normalizeWallSections(sections);
  const moving = normalized.find((section) => section.id === sectionId);
  if (!moving || normalized.length === 1) {
    return normalized.map((section) =>
      section.id === sectionId ? { ...section, xIn: proposed.xIn, yIn: proposed.yIn } : section,
    );
  }

  const candidates = normalized
    .filter((section) => section.id !== sectionId)
    .flatMap((anchor) => snapCandidates(moving, anchor, proposed))
    .sort((a, b) => a.score - b.score);

  for (const candidate of candidates) {
    const moved = normalized.map((section) =>
      section.id === sectionId ? { ...section, xIn: candidate.xIn, yIn: candidate.yIn } : section,
    );
    if (wallSectionsAreConnected(moved)) {
      return moved;
    }
  }

  return normalized;
}

export function applyWallSectionFeatures(
  sections: WallSection[],
  sectionId: string,
  proposed: { xIn: number; yIn: number },
  features: EditorFeatures,
): { xIn: number; yIn: number } {
  const moving = normalizeWallSections(sections).find((section) => section.id === sectionId);
  if (!moving) {
    return proposed;
  }

  let next = proposed;

  if (features.snapToGrid && features.gridSizeIn > 0) {
    next = {
      xIn: roundToPrecision(next.xIn, features.gridSizeIn),
      yIn: roundToPrecision(next.yIn, features.gridSizeIn),
    };
  }

  if (!features.snapToAlignment || features.alignmentToleranceIn <= 0) {
    return next;
  }

  return snapWallSectionToAlignment(sections, moving, next, features.alignmentToleranceIn);
}

export function getWallExteriorEdges(sections: WallSection[]): WallEdge[] {
  const normalized = normalizeWallSections(sections);
  return normalized.flatMap((section) => {
    const rect = rectForSection(section);
    return [
      ...visibleVerticalEdge(rect.left, rect.top, rect.bottom, normalized, section.id),
      ...visibleVerticalEdge(rect.right, rect.top, rect.bottom, normalized, section.id),
      ...visibleHorizontalEdge(rect.top, rect.left, rect.right, normalized, section.id),
      ...visibleHorizontalEdge(rect.bottom, rect.left, rect.right, normalized, section.id),
    ];
  });
}

export function getInsetWallExteriorEdges(sections: WallSection[], gapIn: number): WallEdge[] {
  const normalized = normalizeWallSections(sections);
  const epsilon = 0.01;

  return getWallExteriorEdges(normalized).map((edge) => {
    const vertical = edge.x1 === edge.x2;
    if (vertical) {
      const midpointY = (edge.y1 + edge.y2) / 2;
      const direction = pointIsInsideWall(normalized, edge.x1 + epsilon, midpointY) ? 1 : -1;
      return {
        ...edge,
        x1: edge.x1 + direction * gapIn,
        x2: edge.x2 + direction * gapIn,
      };
    }

    const midpointX = (edge.x1 + edge.x2) / 2;
    const direction = pointIsInsideWall(normalized, midpointX, edge.y1 + epsilon) ? 1 : -1;
    return {
      ...edge,
      y1: edge.y1 + direction * gapIn,
      y2: edge.y2 + direction * gapIn,
    };
  });
}

export function getInsetWallExteriorPaths(sections: WallSection[], gapIn: number): WallPath[] {
  const normalized = normalizeWallSections(sections);

  return getExteriorEdgeLoops(getWallExteriorEdges(normalized))
    .map(simplifyClosedLoop)
    .flatMap((loop) => {
      if (loop.length < 3) {
        return [];
      }

      const insetLines = loop.map((point, index) =>
        insetLineForEdge(point, loop[(index + 1) % loop.length], normalized, gapIn),
      );
      const points = insetLines.flatMap((line, index) => {
        const previous = insetLines[(index - 1 + insetLines.length) % insetLines.length];
        const intersection = intersectInsetLines(previous, line);
        return intersection ? [intersection] : [];
      });

      return points.length >= 3 ? [{ points }] : [];
    });
}

export function validateWallSections(sections: WallSection[]): string[] {
  if (sections.length === 0) {
    return ['Add at least one wall section.'];
  }

  const normalized = normalizeWallSections(sections);
  const issues = normalized.flatMap((section) => {
    const issues: string[] = [];
    if (section.widthIn <= 0) {
      issues.push(`${section.name} needs a positive width.`);
    }
    if (section.heightIn <= 0) {
      issues.push(`${section.name} needs a positive height.`);
    }
    return issues;
  });

  if (normalized.length > 1 && !wallSectionsAreConnected(normalized)) {
    issues.push('Every wall section must connect to the continuous wall by sharing an edge.');
  }

  return issues;
}

function wallSectionsAreConnected(sections: WallSection[]): boolean {
  if (sections.length <= 1) {
    return true;
  }

  const seen = new Set<string>([sections[0].id]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const section of sections) {
      if (seen.has(section.id)) {
        continue;
      }
      if (
        sections.some(
          (candidate) => seen.has(candidate.id) && sectionsShareEdge(candidate, section),
        )
      ) {
        seen.add(section.id);
        changed = true;
      }
    }
  }

  return seen.size === sections.length;
}

function snapWallSectionToAlignment(
  sections: WallSection[],
  moving: WallSection,
  proposed: { xIn: number; yIn: number },
  toleranceIn: number,
): { xIn: number; yIn: number } {
  const others = normalizeWallSections(sections).filter((section) => section.id !== moving.id);
  if (others.length === 0) {
    return proposed;
  }

  const movingRect = rectForSection({ ...moving, xIn: proposed.xIn, yIn: proposed.yIn });
  const targetX = others.flatMap((section) => {
    const rect = rectForSection(section);
    return [rect.left, rect.right, (rect.left + rect.right) / 2];
  });
  const targetY = others.flatMap((section) => {
    const rect = rectForSection(section);
    return [rect.top, rect.bottom, (rect.top + rect.bottom) / 2];
  });

  const xDelta = closestDelta(
    [movingRect.left, movingRect.right, (movingRect.left + movingRect.right) / 2],
    targetX,
    toleranceIn,
  );
  const yDelta = closestDelta(
    [movingRect.top, movingRect.bottom, (movingRect.top + movingRect.bottom) / 2],
    targetY,
    toleranceIn,
  );

  return {
    xIn: xDelta === undefined ? proposed.xIn : roundToPrecision(proposed.xIn + xDelta),
    yIn: yDelta === undefined ? proposed.yIn : roundToPrecision(proposed.yIn + yDelta),
  };
}

function closestDelta(
  movingValues: number[],
  targets: number[],
  toleranceIn: number,
): number | undefined {
  let best: { delta: number; distance: number } | undefined;

  for (const movingValue of movingValues) {
    for (const target of targets) {
      const delta = target - movingValue;
      const distance = Math.abs(delta);
      if (distance <= toleranceIn && (!best || distance < best.distance)) {
        best = { delta, distance };
      }
    }
  }

  return best?.delta;
}

function pointIsInsideWall(sections: WallSection[], xIn: number, yIn: number): boolean {
  return sections.some((section) => {
    const rect = rectForSection(section);
    return xIn >= rect.left && xIn <= rect.right && yIn >= rect.top && yIn <= rect.bottom;
  });
}

function getExteriorEdgeLoops(edges: WallEdge[]): Array<Array<{ x: number; y: number }>> {
  const endpointMap = new Map<string, Array<{ edgeIndex: number; atStart: boolean }>>();
  const addEndpoint = (point: { x: number; y: number }, edgeIndex: number, atStart: boolean) => {
    const key = pointKey(point);
    endpointMap.set(key, [...(endpointMap.get(key) ?? []), { edgeIndex, atStart }]);
  };

  edges.forEach((edge, edgeIndex) => {
    addEndpoint({ x: edge.x1, y: edge.y1 }, edgeIndex, true);
    addEndpoint({ x: edge.x2, y: edge.y2 }, edgeIndex, false);
  });

  const visited = new Set<number>();
  const loops: Array<Array<{ x: number; y: number }>> = [];

  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    if (visited.has(edgeIndex)) {
      continue;
    }

    const first = edges[edgeIndex];
    const start = { x: first.x1, y: first.y1 };
    let currentPoint = { x: first.x2, y: first.y2 };
    let currentEdgeIndex = edgeIndex;
    const loop = [start];
    visited.add(edgeIndex);

    while (true) {
      loop.push(currentPoint);
      if (pointsMatch(currentPoint, start)) {
        loops.push(loop.slice(0, -1));
        break;
      }

      const next = (endpointMap.get(pointKey(currentPoint)) ?? []).find(
        (candidate) =>
          candidate.edgeIndex !== currentEdgeIndex && !visited.has(candidate.edgeIndex),
      );
      if (!next) {
        break;
      }

      const edge = edges[next.edgeIndex];
      currentPoint = next.atStart ? { x: edge.x2, y: edge.y2 } : { x: edge.x1, y: edge.y1 };
      currentEdgeIndex = next.edgeIndex;
      visited.add(next.edgeIndex);
    }
  }

  return loops;
}

function simplifyClosedLoop(
  points: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return (
      !(nearlyEqual(previous.x, point.x) && nearlyEqual(point.x, next.x)) &&
      !(nearlyEqual(previous.y, point.y) && nearlyEqual(point.y, next.y))
    );
  });
}

function insetLineForEdge(
  start: { x: number; y: number },
  end: { x: number; y: number },
  sections: WallSection[],
  gapIn: number,
): { vertical: boolean; position: number } {
  const epsilon = 0.01;
  if (nearlyEqual(start.x, end.x)) {
    const midpointY = (start.y + end.y) / 2;
    const direction = pointIsInsideWall(sections, start.x + epsilon, midpointY) ? 1 : -1;
    return { vertical: true, position: start.x + direction * gapIn };
  }

  const midpointX = (start.x + end.x) / 2;
  const direction = pointIsInsideWall(sections, midpointX, start.y + epsilon) ? 1 : -1;
  return { vertical: false, position: start.y + direction * gapIn };
}

function intersectInsetLines(
  first: { vertical: boolean; position: number },
  second: { vertical: boolean; position: number },
): { x: number; y: number } | null {
  if (first.vertical === second.vertical) {
    return null;
  }

  return first.vertical
    ? { x: first.position, y: second.position }
    : { x: second.position, y: first.position };
}

function pointKey(point: { x: number; y: number }): string {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
}

function pointsMatch(first: { x: number; y: number }, second: { x: number; y: number }): boolean {
  return nearlyEqual(first.x, second.x) && nearlyEqual(first.y, second.y);
}

function snapCandidates(
  moving: WallSection,
  anchor: WallSection,
  proposed: { xIn: number; yIn: number },
): Array<{ xIn: number; yIn: number; score: number }> {
  const anchorRect = rectForSection(anchor);
  const verticalMinY = anchorRect.top - moving.heightIn + MIN_SHARED_EDGE_IN;
  const verticalMaxY = anchorRect.bottom - MIN_SHARED_EDGE_IN;
  const horizontalMinX = anchorRect.left - moving.widthIn + MIN_SHARED_EDGE_IN;
  const horizontalMaxX = anchorRect.right - MIN_SHARED_EDGE_IN;

  const candidates = [
    {
      xIn: anchorRect.left - moving.widthIn,
      yIn: clamp(proposed.yIn, verticalMinY, verticalMaxY),
    },
    {
      xIn: anchorRect.right,
      yIn: clamp(proposed.yIn, verticalMinY, verticalMaxY),
    },
    {
      xIn: clamp(proposed.xIn, horizontalMinX, horizontalMaxX),
      yIn: anchorRect.top - moving.heightIn,
    },
    {
      xIn: clamp(proposed.xIn, horizontalMinX, horizontalMaxX),
      yIn: anchorRect.bottom,
    },
  ];

  return candidates.map((candidate) => ({
    ...candidate,
    score: Math.hypot(candidate.xIn - proposed.xIn, candidate.yIn - proposed.yIn),
  }));
}

function visibleVerticalEdge(
  xIn: number,
  startY: number,
  endY: number,
  sections: WallSection[],
  sectionId: string,
): WallEdge[] {
  const covered = sections
    .filter((section) => section.id !== sectionId)
    .map(rectForSection)
    .filter((rect) => nearlyEqual(rect.left, xIn) || nearlyEqual(rect.right, xIn))
    .map((rect) => [Math.max(startY, rect.top), Math.min(endY, rect.bottom)] as const)
    .filter(([start, end]) => end - start >= MIN_SHARED_EDGE_IN);

  return subtractRanges(startY, endY, covered).map(([visibleStart, visibleEnd]) => ({
    x1: xIn,
    y1: visibleStart,
    x2: xIn,
    y2: visibleEnd,
  }));
}

function visibleHorizontalEdge(
  yIn: number,
  startX: number,
  endX: number,
  sections: WallSection[],
  sectionId: string,
): WallEdge[] {
  const covered = sections
    .filter((section) => section.id !== sectionId)
    .map(rectForSection)
    .filter((rect) => nearlyEqual(rect.top, yIn) || nearlyEqual(rect.bottom, yIn))
    .map((rect) => [Math.max(startX, rect.left), Math.min(endX, rect.right)] as const)
    .filter(([start, end]) => end - start >= MIN_SHARED_EDGE_IN);

  return subtractRanges(startX, endX, covered).map(([visibleStart, visibleEnd]) => ({
    x1: visibleStart,
    y1: yIn,
    x2: visibleEnd,
    y2: yIn,
  }));
}

function subtractRanges(
  start: number,
  end: number,
  coveredRanges: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  let visible: Array<[number, number]> = [[start, end]];

  for (const [coveredStart, coveredEnd] of coveredRanges) {
    visible = visible.flatMap(([visibleStart, visibleEnd]) => {
      if (coveredEnd <= visibleStart || coveredStart >= visibleEnd) {
        return [[visibleStart, visibleEnd]];
      }
      return [
        [visibleStart, Math.max(visibleStart, coveredStart)] as [number, number],
        [Math.min(visibleEnd, coveredEnd), visibleEnd] as [number, number],
      ].filter(([nextStart, nextEnd]) => nextEnd - nextStart >= MIN_SHARED_EDGE_IN);
    });
  }

  return visible;
}

function rectForSection(section: WallSection): WallRect {
  const xIn = section.xIn ?? 0;
  const yIn = section.yIn ?? 0;
  return {
    left: xIn,
    top: yIn,
    right: xIn + section.widthIn,
    bottom: yIn + section.heightIn,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function nearlyEqual(first: number, second: number): boolean {
  return Math.abs(first - second) < 0.001;
}
