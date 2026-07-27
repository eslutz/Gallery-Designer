import { describe, expect, it } from 'vitest';
import { buildMeasurementInstructions } from './measurements';
import type { ArtPiece, Placement, WallSection } from '../types';

const sections: WallSection[] = [{ id: 'main', name: 'Main wall', widthIn: 120, heightIn: 96 }];

const pieces: ArtPiece[] = [
  { id: 'upper', label: 'Upper left', widthIn: 20, heightIn: 16 },
  { id: 'right', label: 'Right piece', widthIn: 18, heightIn: 18 },
  { id: 'lower', label: 'Lower piece', widthIn: 16, heightIn: 12 },
];

const placements: Placement[] = [
  { pieceId: 'right', sectionId: 'main', xIn: 40, yIn: 10 },
  { pieceId: 'lower', sectionId: 'main', xIn: 12, yIn: 34 },
  { pieceId: 'upper', sectionId: 'main', xIn: 12, yIn: 10 },
];

describe('measurement instructions', () => {
  it('orders pieces from upper-left and references nearest wall or neighbor', () => {
    const instructions = buildMeasurementInstructions(sections, pieces, placements, 'in');

    expect(instructions.map((item) => item.pieceLabel)).toEqual([
      'Upper left',
      'Right piece',
      'Lower piece',
    ]);
    expect(instructions[0].topReference.label).toBe('top of Main wall');
    expect(instructions[0].sideReference.label).toBe('left side of Main wall');
    expect(instructions[1].sideReference.label).toBe('right side of Upper left');
    expect(instructions[1].sideReference.distanceIn).toBe(8);
    expect(instructions[2].topReference.label).toBe('bottom of Upper left');
    expect(instructions[2].topReference.distanceIn).toBe(8);
  });

  it('anchors hook measurements to the wall/section, not the piece frame', () => {
    const piece: ArtPiece = {
      id: 'hooked',
      label: 'Hooked piece',
      widthIn: 20,
      heightIn: 16,
      hookSpec: { count: 1, topOffsetIn: 3, leftOffsetIn: 6 },
    };
    const instructions = buildMeasurementInstructions(
      sections,
      [piece],
      [{ pieceId: 'hooked', sectionId: 'main', xIn: 12, yIn: 10 }],
      'in',
    );

    const [instruction] = instructions;
    expect(instruction.topReference).toMatchObject({ label: 'top of Main wall', distanceIn: 10 });
    expect(instruction.sideReference).toMatchObject({
      label: 'left side of Main wall',
      distanceIn: 12,
      anchor: 'left',
    });

    const [hook] = instruction.hooks;
    // 10 (piece's own top distance) + 3 (hook's offset within the frame) —
    // not just the frame-local "3 in down" a hanger can't act on directly.
    expect(hook.topReference).toEqual({
      label: 'top of Main wall',
      distanceIn: 13,
      formatted: '13 in',
    });
    expect(hook.sideReference).toEqual({
      label: 'left side of Main wall',
      distanceIn: 18,
      formatted: '18 in',
    });
  });

  it('flips a hook offset onto the far edge when the nearest side reference is right-anchored', () => {
    // wallLeftReference is only used for the topmost-leftmost (index 0)
    // piece; a small filler piece up in the corner pushes the piece under
    // test to index 1, so it goes through the nearest-reference search that
    // can pick the section's right side instead.
    const filler: ArtPiece = { id: 'filler', label: 'Filler', widthIn: 10, heightIn: 10 };
    const piece: ArtPiece = {
      id: 'right-anchored',
      label: 'Right anchored',
      widthIn: 20,
      heightIn: 16,
      hookSpec: { count: 1, topOffsetIn: 2, leftOffsetIn: 15 },
    };
    // Placed close to the wall's right edge (120 wide), and far enough below
    // the filler that they don't share any side-reference candidates, so the
    // nearest side reference is the section's right side rather than its left.
    const instructions = buildMeasurementInstructions(
      sections,
      [filler, piece],
      [
        { pieceId: 'filler', sectionId: 'main', xIn: 0, yIn: 0 },
        { pieceId: 'right-anchored', sectionId: 'main', xIn: 95, yIn: 50 },
      ],
      'in',
    );

    const instruction = instructions.find((item) => item.pieceLabel === 'Right anchored')!;
    expect(instruction.sideReference).toMatchObject({
      label: 'right side of Main wall',
      anchor: 'right',
      distanceIn: 5,
    });

    const [hook] = instruction.hooks;
    // 5 (piece's own distance from the right edge) + 5 (hook's distance from
    // the piece's own right edge, i.e. 20 wide - 15 from the left).
    expect(hook.sideReference).toEqual({
      label: 'right side of Main wall',
      distanceIn: 10,
      formatted: '10 in',
    });
  });

  it('can report absolute placement coordinates from the continuous wall origin', () => {
    const multiSectionWall: WallSection[] = [
      { id: 'main', name: 'Main wall', widthIn: 120, heightIn: 96 },
      {
        id: 'return',
        name: 'Return wall',
        widthIn: 48,
        heightIn: 72,
        xIn: 120,
        yIn: 24,
      },
    ];
    const instructions = buildMeasurementInstructions(
      multiSectionWall,
      pieces,
      [
        { pieceId: 'upper', sectionId: 'main', xIn: 12, yIn: 10 },
        { pieceId: 'right', sectionId: 'return', xIn: 8, yIn: 16 },
      ],
      'in',
      'absolute',
    );

    expect(instructions[0].pieceLabel).toBe('Upper left');
    expect(instructions[0].topReference).toMatchObject({
      label: 'top-left wall origin',
      distanceIn: 10,
      formatted: '10 in',
    });
    expect(instructions[0].sideReference).toMatchObject({
      label: 'top-left wall origin',
      distanceIn: 12,
      formatted: '12 in',
    });
    expect(instructions[1].pieceLabel).toBe('Right piece');
    expect(instructions[1].topReference.distanceIn).toBe(40);
    expect(instructions[1].sideReference.distanceIn).toBe(128);
  });
});
