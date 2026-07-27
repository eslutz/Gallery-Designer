import { describe, expect, it } from 'vitest';
import type { HookMeasurement, MeasurementInstruction } from '../types';
import { buildMeasurementTableRows, formatHookSummary } from './measurementTable';

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

describe('formatHookSummary', () => {
  it('reports no hook data for an unhooked piece', () => {
    expect(formatHookSummary([])).toBe('No hook data');
  });

  it('states a single hook once, with no per-hook label', () => {
    const hooks: HookMeasurement[] = [
      {
        label: 'Hook',
        topReference: { label: 'top of Main wall', distanceIn: 13, formatted: '13 in' },
        sideReference: { label: 'left side of Main wall', distanceIn: 18, formatted: '18 in' },
      },
    ];

    expect(formatHookSummary(hooks)).toBe(
      '13 in from top of Main wall; 18 in from left side of Main wall',
    );
  });

  it('states a shared top distance once and breaks out each hook only for the side distance', () => {
    const hooks: HookMeasurement[] = [
      {
        label: 'Left hook',
        topReference: { label: 'top of Main wall', distanceIn: 15, formatted: '15 in' },
        sideReference: { label: 'left side of Main wall', distanceIn: 20, formatted: '20 in' },
      },
      {
        label: 'Right hook',
        topReference: { label: 'top of Main wall', distanceIn: 15, formatted: '15 in' },
        sideReference: { label: 'left side of Main wall', distanceIn: 46, formatted: '46 in' },
      },
    ];

    expect(formatHookSummary(hooks)).toBe(
      '15 in from top of Main wall; left hook 20 in, right hook 46 in from left side of Main wall',
    );
  });

  it('falls back to a per-hook breakdown if the top distance ever diverges', () => {
    const hooks: HookMeasurement[] = [
      {
        label: 'Left hook',
        topReference: { label: 'top of Main wall', distanceIn: 15, formatted: '15 in' },
        sideReference: { label: 'left side of Main wall', distanceIn: 20, formatted: '20 in' },
      },
      {
        label: 'Right hook',
        topReference: { label: 'top of Main wall', distanceIn: 17, formatted: '17 in' },
        sideReference: { label: 'left side of Main wall', distanceIn: 46, formatted: '46 in' },
      },
    ];

    expect(formatHookSummary(hooks)).toBe(
      'Left hook: 15 in from top of Main wall; Right hook: 17 in from top of Main wall; ' +
        'left hook 20 in, right hook 46 in from left side of Main wall',
    );
  });
});
