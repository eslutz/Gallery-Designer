import { describe, expect, it } from 'vitest';
import {
  applyWallSectionFeatures,
  getSectionOffsetY,
  getInsetWallExteriorPaths,
  getWallExteriorEdges,
  getWallBounds,
  getWallLayout,
  moveWallSection,
  sectionsShareEdge,
  validateWallSections,
} from './wall';
import type { EditorFeatures, WallSection } from '../types';

const sections: WallSection[] = [
  {
    id: 'main',
    name: 'Main wall',
    widthIn: 96,
    heightIn: 84,
    xIn: 0,
    yIn: 0,
  },
  {
    id: 'return',
    name: 'Return wall',
    widthIn: 72,
    heightIn: 84,
    xIn: 96,
    yIn: 0,
  },
];

const baseFeatures: EditorFeatures = {
  snapToGrid: false,
  gridSizeIn: 1,
  snapToAlignment: false,
  alignmentToleranceIn: 2,
  wallEdgeBuffer: false,
  wallEdgeBufferGapIn: 2,
  artPieceBuffer: false,
  artPieceBufferGapIn: 2,
  measurementReferenceMode: 'relative',
};

describe('wall section geometry', () => {
  it('preserves unfolded defaults for sections without explicit coordinates', () => {
    const layout = getWallLayout([
      { id: 'a', name: 'A', widthIn: 20, heightIn: 30 },
      { id: 'b', name: 'B', widthIn: 10, heightIn: 30 },
    ]);

    expect(layout.map(({ offsetXIn, offsetYIn }) => ({ offsetXIn, offsetYIn }))).toEqual([
      { offsetXIn: 0, offsetYIn: 0 },
      { offsetXIn: 20, offsetYIn: 0 },
    ]);
  });

  it('detects positive shared edge overlap and rejects corner-only contact', () => {
    expect(sectionsShareEdge(sections[0], sections[1])).toBe(true);
    expect(
      sectionsShareEdge(sections[0], {
        ...sections[1],
        xIn: 96,
        yIn: 84,
      }),
    ).toBe(false);
  });

  it('requires all multi-section walls to remain connected by shared edges', () => {
    expect(validateWallSections(sections)).toEqual([]);
    expect(
      validateWallSections([
        sections[0],
        {
          ...sections[1],
          xIn: 220,
          yIn: 0,
        },
      ]),
    ).toContain('Every wall section must connect to the continuous wall by sharing an edge.');
  });

  it('snaps a moved section to the closest valid shared-edge position', () => {
    const moved = moveWallSection(sections, 'return', { xIn: 6, yIn: 90 });

    expect(moved.map(({ id, xIn, yIn }) => ({ id, xIn, yIn }))).toEqual([
      { id: 'main', xIn: 0, yIn: 0 },
      { id: 'return', xIn: 6, yIn: 84 },
    ]);
    expect(validateWallSections(moved)).toEqual([]);
  });

  it('computes bounds and y offsets for positioned sections', () => {
    const moved = moveWallSection(sections, 'return', { xIn: 0, yIn: 84 });

    expect(getSectionOffsetY(moved, 'return')).toBe(84);
    expect(getWallBounds(moved)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 96,
      maxY: 168,
      width: 96,
      height: 168,
    });
  });

  it('snaps wall section proposals to the configured grid size', () => {
    expect(
      applyWallSectionFeatures(
        [
          {
            id: 'solo',
            name: 'Solo',
            widthIn: 40,
            heightIn: 30,
            xIn: 0,
            yIn: 0,
          },
        ],
        'solo',
        { xIn: 13.1, yIn: 16.9 },
        { ...baseFeatures, snapToGrid: true, gridSizeIn: 6 },
      ),
    ).toEqual({ xIn: 12, yIn: 18 });
  });

  it('snaps wall section proposals into alignment with other wall sections only', () => {
    const alignedSections: WallSection[] = [
      { id: 'left', name: 'Left', widthIn: 60, heightIn: 40, xIn: 0, yIn: 0 },
      {
        id: 'moving',
        name: 'Moving',
        widthIn: 24,
        heightIn: 20,
        xIn: 60,
        yIn: 0,
      },
    ];

    expect(
      applyWallSectionFeatures(
        alignedSections,
        'moving',
        { xIn: 60.4, yIn: 0.6 },
        { ...baseFeatures, snapToAlignment: true, alignmentToleranceIn: 1 },
      ),
    ).toEqual({ xIn: 60, yIn: 0 });
  });

  it('omits shared section seams from the exterior wall edges', () => {
    const edges = getWallExteriorEdges(sections);

    expect(
      edges.some((edge) => edge.x1 === 96 && edge.x2 === 96 && edge.y1 === 0 && edge.y2 === 84),
    ).toBe(false);
    expect(
      edges.some((edge) => edge.x1 === 0 && edge.x2 === 0 && edge.y1 === 0 && edge.y2 === 84),
    ).toBe(true);
  });

  it('builds a joined inset contour that mirrors a stepped wall shape', () => {
    const steppedWall: WallSection[] = [
      { id: 'left', name: 'Left', widthIn: 40, heightIn: 80, xIn: 0, yIn: 0 },
      {
        id: 'right',
        name: 'Right',
        widthIn: 60,
        heightIn: 40,
        xIn: 40,
        yIn: 40,
      },
    ];

    const [path] = getInsetWallExteriorPaths(steppedWall, 2);

    expect(path.points).toEqual(
      expect.arrayContaining([
        { x: 2, y: 2 },
        { x: 38, y: 2 },
        { x: 38, y: 42 },
        { x: 98, y: 42 },
        { x: 98, y: 78 },
        { x: 2, y: 78 },
      ]),
    );
  });
});
