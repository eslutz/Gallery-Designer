import { describe, expect, it } from 'vitest';
import { buildMeasurementInstructions } from './measurements';
import type { ArtPiece, Placement, WallSection } from '../../types';

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

  it('measures hooks from the wall origin, not the piece frame or the piece reference', () => {
    // wallLeftReference is only used for the topmost-leftmost (index 0)
    // piece; a filler piece up in the corner pushes the piece under test to
    // index 1, so its own Side reference resolves to something other than
    // the wall's left edge (here, the filler's right side) — hooks must
    // ignore that and still measure from the true wall origin.
    const filler: ArtPiece = { id: 'filler', label: 'Filler', widthIn: 10, heightIn: 10 };
    const piece: ArtPiece = {
      id: 'hooked',
      label: 'Hooked piece',
      widthIn: 20,
      heightIn: 16,
      hookSpec: { count: 1, topOffsetIn: 3, leftOffsetIn: 6 },
    };
    const instructions = buildMeasurementInstructions(
      sections,
      [filler, piece],
      [
        { pieceId: 'filler', sectionId: 'main', xIn: 0, yIn: 10 },
        { pieceId: 'hooked', sectionId: 'main', xIn: 12, yIn: 10 },
      ],
      'in',
    );

    const instruction = instructions.find((item) => item.pieceLabel === 'Hooked piece')!;
    // The piece's own Side reference is relative to its neighbor, not the wall.
    expect(instruction.sideReference).toMatchObject({
      label: 'right side of Filler',
      distanceIn: 2,
    });

    const [hook] = instruction.hooks;
    // Wall origin is (0, 0) here, so: 10 (piece top) + 3 (hook offset) = 13,
    // and 12 (piece left) + 6 (hook offset) = 18 — independent of whatever
    // reference the piece's own Side row happens to use.
    expect(hook).toEqual({
      label: 'Hook',
      topDistanceIn: 13,
      topFormatted: '13 in',
      sideDistanceIn: 18,
      sideFormatted: '18 in',
    });
  });

  it('measures hooks from the true wall origin across multiple sections, not the local section', () => {
    const multiSectionWall: WallSection[] = [
      { id: 'main', name: 'Main wall', widthIn: 120, heightIn: 96 },
      { id: 'return', name: 'Return wall', widthIn: 48, heightIn: 72, xIn: 120, yIn: 24 },
    ];
    const piece: ArtPiece = {
      id: 'hooked',
      label: 'Hooked piece',
      widthIn: 20,
      heightIn: 16,
      hookSpec: { count: 1, topOffsetIn: 2, leftOffsetIn: 4 },
    };
    const instructions = buildMeasurementInstructions(
      multiSectionWall,
      [piece],
      [{ pieceId: 'hooked', sectionId: 'return', xIn: 8, yIn: 6 }],
      'in',
    );

    const [hook] = instructions[0].hooks;
    // Return section sits at (120, 24) within the continuous wall, so the
    // hook's absolute position folds in that section offset too:
    // top = 24 (section) + 6 (placement) + 2 (hook) = 32
    // left = 120 (section) + 8 (placement) + 4 (hook) = 132
    expect(hook.topDistanceIn).toBe(32);
    expect(hook.sideDistanceIn).toBe(132);
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
