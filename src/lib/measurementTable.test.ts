import { describe, expect, it } from 'vitest';
import type { MeasurementInstruction } from '../types';
import { buildMeasurementTableRows } from './measurementTable';

const instructions: MeasurementInstruction[] = [
  {
    order: 1,
    pieceId: 'piece-1',
    pieceLabel: 'Piece 1',
    sectionName: 'Main wall',
    pieceDimensions: {
      widthIn: 16,
      heightIn: 20,
      formatted: '16 in x 20 in',
    },
    topReference: {
      label: 'top of Main wall',
      distanceIn: 10,
      formatted: '10 in',
    },
    sideReference: {
      label: 'left side of Main wall',
      distanceIn: 12,
      formatted: '12 in',
    },
    hooks: [],
  },
];

describe('measurement table rows', () => {
  it('omits dimensions from displayed measurement rows by default', () => {
    expect(buildMeasurementTableRows(instructions)[0]).not.toHaveProperty('dimensions');
  });

  it('includes dimensions for export measurement rows', () => {
    expect(buildMeasurementTableRows(instructions, { includeDimensions: true })[0]).toMatchObject({
      dimensions: '16 in x 20 in',
    });
  });
});
