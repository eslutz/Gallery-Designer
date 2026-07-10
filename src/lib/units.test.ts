import { describe, expect, it } from 'vitest';
import {
  formatMeasurement,
  parseMeasurement,
  roundToPrecision,
  roundToSizePrecision,
  toInches,
} from './units';

describe('measurement units', () => {
  it('parses whole numbers, decimals, and mixed fractions as inches', () => {
    expect(parseMeasurement('42')).toBe(42);
    expect(parseMeasurement('12.5')).toBe(12.5);
    expect(parseMeasurement('10 3/8')).toBe(10.375);
    expect(parseMeasurement('3/4')).toBe(0.75);
  });

  it('converts centimeters to inches for metric input', () => {
    expect(toInches(30.48, 'cm')).toBeCloseTo(12);
  });

  it('rounds and formats default inch output to eighths', () => {
    expect(roundToPrecision(12.31)).toBe(12.25);
    expect(formatMeasurement(12.25, 'in')).toBe('12 1/4 in');
    expect(formatMeasurement(10, 'in')).toBe('10 in');
  });

  it('rounds entered sizes to hundredths while positions use common eighth-inch units', () => {
    expect(roundToSizePrecision(12.346)).toBe(12.35);
    expect(roundToSizePrecision(12.344)).toBe(12.34);
    expect(formatMeasurement(29.375, 'in')).toBe('29 3/8 in');
  });

  it('formats metric output to one decimal centimeter', () => {
    expect(formatMeasurement(12, 'cm')).toBe('30.5 cm');
  });
});
