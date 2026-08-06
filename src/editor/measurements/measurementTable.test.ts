import { describe, expect, it } from 'vitest';
import type { HookMeasurement, MeasurementInstruction } from '../../types';
import { buildMeasurementTableRows, formatHookLines } from './measurementTable';

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

describe('formatHookLines', () => {
  it('returns an empty array when there are no hooks', () => {
    expect(formatHookLines([])).toEqual([]);
  });

  it('formats one line per hook using its own top/side distance', () => {
    const hooks: HookMeasurement[] = [
      {
        label: 'Hook',
        topDistanceIn: 13,
        topFormatted: '13 in',
        sideDistanceIn: 18,
        sideFormatted: '18 in',
      },
    ];

    expect(formatHookLines(hooks)).toEqual(['13 in down, 18 in from left']);
  });

  it('formats independent lines for each hook of a two-hook piece', () => {
    const hooks: HookMeasurement[] = [
      {
        label: 'Left hook',
        topDistanceIn: 21,
        topFormatted: '21 in',
        sideDistanceIn: 43,
        sideFormatted: '43 in',
      },
      {
        label: 'Right hook',
        topDistanceIn: 21,
        topFormatted: '21 in',
        sideDistanceIn: 51,
        sideFormatted: '51 in',
      },
    ];

    expect(formatHookLines(hooks)).toEqual([
      '21 in down, 43 in from left',
      '21 in down, 51 in from left',
    ]);
  });
});
