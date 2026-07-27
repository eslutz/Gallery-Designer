import { describe, expect, it } from 'vitest';
import {
  clampPlacement,
  getAutoPlacementIssues,
  getPlacementIssues,
  getUnplacedPieceIssues,
  isPlacementWithinWall,
  placementsOverlapOrTouch,
  reassignPlacementToContainingSection,
} from './placement';
import type { ArtPiece, Placement, WallSection } from '../types';

const sections: WallSection[] = [
  { id: 'a', name: 'Left wall', widthIn: 96, heightIn: 84 },
  { id: 'b', name: 'Return wall', widthIn: 72, heightIn: 84 },
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

  it('reports manual outside-wall and collision issues before export', () => {
    const placements: Placement[] = [
      { pieceId: 'one', sectionId: 'a', xIn: 160, yIn: 10 },
      { pieceId: 'two', sectionId: 'a', xIn: 160, yIn: 10 },
    ];

    expect(getPlacementIssues(sections, pieces, placements)).toEqual([
      'One extends beyond the wall boundary.',
      'Two extends beyond the wall boundary.',
      'One touches or overlaps Two.',
    ]);
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
        xIn: 0,
        yIn: 0,
      },
      {
        id: 'b',
        name: 'Right wall',
        widthIn: 96,
        heightIn: 84,
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

  it('reassigns a moved placement to the section it visually occupies', () => {
    const sideBySideSections: WallSection[] = [
      {
        id: 'left',
        name: 'Left',
        widthIn: 80,
        heightIn: 60,
        xIn: 0,
        yIn: 0,
      },
      {
        id: 'right',
        name: 'Right',
        widthIn: 80,
        heightIn: 60,
        xIn: 80,
        yIn: 0,
      },
    ];
    const piece: ArtPiece = { id: 'poster', label: 'Poster', widthIn: 20, heightIn: 20 };
    const stalePlacement: Placement = {
      pieceId: 'poster',
      sectionId: 'right',
      xIn: -70,
      yIn: 10,
    };

    expect(reassignPlacementToContainingSection(sideBySideSections, stalePlacement, piece)).toEqual(
      {
        pieceId: 'poster',
        sectionId: 'left',
        xIn: 10,
        yIn: 10,
      },
    );
  });
});

describe('getUnplacedPieceIssues', () => {
  const pieces: ArtPiece[] = [
    { id: 'p1', label: 'Poster', widthIn: 10, heightIn: 10 },
    { id: 'p2', label: 'Poster', widthIn: 10, heightIn: 10 },
    { id: 'p3', label: 'Print', widthIn: 8, heightIn: 8 },
  ];

  it('returns no issues when every piece is placed', () => {
    const placements: Placement[] = [
      { pieceId: 'p1', sectionId: 'a', xIn: 0, yIn: 0 },
      { pieceId: 'p2', sectionId: 'a', xIn: 20, yIn: 0 },
      { pieceId: 'p3', sectionId: 'a', xIn: 40, yIn: 0 },
    ];
    expect(getUnplacedPieceIssues(pieces, placements)).toEqual([]);
  });

  it('reports a singular message for one unplaced piece', () => {
    expect(getUnplacedPieceIssues([pieces[2]], [])).toEqual(['Print has not been placed.']);
  });

  it('groups unplaced pieces sharing a label into one plural message', () => {
    expect(getUnplacedPieceIssues(pieces, [])).toEqual([
      '2 pieces named Poster have not been placed.',
      'Print has not been placed.',
    ]);
  });
});
