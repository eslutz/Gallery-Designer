import { describe, expect, it } from 'vitest';
import type { ArtPiece, Placement, WallSection } from '../types';
import {
  getGroupBounds,
  getPieceIdsIntersectingRect,
  normalizeSelectionRect,
  translatePlacementGroup,
} from './multiSelection';

const sections: WallSection[] = [
  {
    id: 'left',
    name: 'Left',
    widthIn: 50,
    heightIn: 40,
    cornerAfter: 'none',
    xIn: 0,
    yIn: 0,
  },
  {
    id: 'right',
    name: 'Right',
    widthIn: 50,
    heightIn: 40,
    cornerAfter: 'none',
    xIn: 50,
    yIn: 10,
  },
];

const pieces: ArtPiece[] = [
  { id: 'one', label: 'One', widthIn: 10, heightIn: 10 },
  { id: 'two', label: 'Two', widthIn: 8, heightIn: 12 },
  { id: 'three', label: 'Three', widthIn: 6, heightIn: 6 },
];

const placements: Placement[] = [
  { pieceId: 'one', sectionId: 'left', xIn: 10, yIn: 10 },
  { pieceId: 'two', sectionId: 'right', xIn: 5, yIn: 5 },
  { pieceId: 'three', sectionId: 'right', xIn: 30, yIn: 20 },
];

describe('multi-selection geometry', () => {
  it('normalizes selection rectangles dragged in any direction', () => {
    expect(normalizeSelectionRect({ x: 30, y: 25 }, { x: 10, y: 5 })).toEqual({
      left: 10,
      top: 5,
      right: 30,
      bottom: 25,
    });
  });

  it('selects pieces with positive-area overlap in global wall coordinates', () => {
    expect(
      getPieceIdsIntersectingRect(sections, pieces, placements, {
        left: 15,
        top: 15,
        right: 60,
        bottom: 25,
      }),
    ).toEqual(['one', 'two']);

    expect(
      getPieceIdsIntersectingRect(sections, pieces, placements, {
        left: 20,
        top: 0,
        right: 55,
        bottom: 10,
      }),
    ).toEqual([]);
  });

  it('returns the global bounds of the selected placements', () => {
    expect(getGroupBounds(sections, pieces, placements, ['one', 'two'])).toEqual({
      left: 10,
      top: 10,
      right: 63,
      bottom: 27,
    });
  });

  it('applies one global delta and reassigns pieces without changing their spacing', () => {
    const translated = translatePlacementGroup(
      sections,
      pieces,
      placements,
      ['one', 'two'],
      40,
      10,
    );

    expect(translated).toEqual([
      { pieceId: 'one', sectionId: 'right', xIn: 0, yIn: 10 },
      { pieceId: 'two', sectionId: 'right', xIn: 45, yIn: 15 },
    ]);
    expect(getGroupBounds(sections, pieces, translated, ['one', 'two'])).toEqual({
      left: 50,
      top: 20,
      right: 103,
      bottom: 37,
    });
  });
});
