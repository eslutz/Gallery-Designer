import { describe, expect, it } from 'vitest';
import {
  clampPlacement,
  getAutoPlacementIssues,
  getPlacementIssues,
  isPlacementWithinWall,
  placementsOverlapOrTouch,
} from './placement';
import type { ArtPiece, Placement, WallSection } from '../types';

const sections: WallSection[] = [
  { id: 'a', name: 'Left wall', widthIn: 96, heightIn: 84, cornerAfter: 'right' },
  { id: 'b', name: 'Return wall', widthIn: 72, heightIn: 84, cornerAfter: 'none' },
];

const pieces: ArtPiece[] = [
  { id: 'one', label: 'One', widthIn: 20, heightIn: 16 },
  { id: 'two', label: 'Two', widthIn: 18, heightIn: 12 },
];

describe('placement constraints', () => {
  it('detects overlapping and touching pieces as invalid', () => {
    const first: Placement = { pieceId: 'one', sectionId: 'a', xIn: 10, yIn: 10 };
    expect(
      placementsOverlapOrTouch(first, pieces[0], { ...first, pieceId: 'two' }, pieces[1]),
    ).toBe(true);
    expect(
      placementsOverlapOrTouch(
        first,
        pieces[0],
        { pieceId: 'two', sectionId: 'a', xIn: 30, yIn: 10 },
        pieces[1],
      ),
    ).toBe(true);
    expect(
      placementsOverlapOrTouch(
        first,
        pieces[0],
        { pieceId: 'two', sectionId: 'a', xIn: 31, yIn: 10 },
        pieces[1],
      ),
    ).toBe(false);
  });

  it('clamps placements inside their wall section', () => {
    expect(
      clampPlacement({ pieceId: 'one', sectionId: 'a', xIn: 90, yIn: -5 }, pieces[0], sections[0]),
    ).toEqual({
      pieceId: 'one',
      sectionId: 'a',
      xIn: 76,
      yIn: 0,
    });
  });

  it('does not report manual outside-wall and collision issues', () => {
    const placements: Placement[] = [
      { pieceId: 'one', sectionId: 'a', xIn: 160, yIn: 10 },
      { pieceId: 'two', sectionId: 'a', xIn: 160, yIn: 10 },
    ];

    expect(getPlacementIssues(sections, pieces, placements)).toEqual([]);
  });

  it('reports outside-wall and collision issues for automatic placement', () => {
    const placements: Placement[] = [
      { pieceId: 'one', sectionId: 'a', xIn: 160, yIn: 10 },
      { pieceId: 'two', sectionId: 'a', xIn: 160, yIn: 10 },
    ];

    expect(getAutoPlacementIssues(sections, pieces, placements)).toEqual([
      'One extends beyond the wall boundary.',
      'Two extends beyond the wall boundary.',
      'One touches or overlaps Two.',
    ]);
  });

  it('allows a piece to span connected sections when it fits inside the exterior wall union', () => {
    const connectedSections: WallSection[] = [
      {
        id: 'a',
        name: 'Left wall',
        widthIn: 96,
        heightIn: 84,
        cornerAfter: 'none',
        xIn: 0,
        yIn: 0,
      },
      {
        id: 'b',
        name: 'Right wall',
        widthIn: 96,
        heightIn: 84,
        cornerAfter: 'none',
        xIn: 96,
        yIn: 0,
      },
    ];
    const spanningPiece: ArtPiece = { id: 'wide', label: 'Wide', widthIn: 24, heightIn: 20 };
    const spanningPlacement: Placement = {
      pieceId: 'wide',
      sectionId: 'a',
      xIn: 84,
      yIn: 20,
    };

    expect(isPlacementWithinWall(connectedSections, spanningPlacement, spanningPiece)).toBe(true);
    expect(getPlacementIssues(connectedSections, [spanningPiece], [spanningPlacement])).toEqual([]);
  });
});
