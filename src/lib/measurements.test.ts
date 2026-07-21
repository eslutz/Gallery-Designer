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
