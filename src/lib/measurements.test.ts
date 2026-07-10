import { describe, expect, it } from 'vitest';
import { buildMeasurementInstructions } from './measurements';
import type { ArtPiece, Placement, WallSection } from '../types';

const sections: WallSection[] = [
  { id: 'main', name: 'Main wall', widthIn: 120, heightIn: 96, cornerAfter: 'left' },
];

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
});
