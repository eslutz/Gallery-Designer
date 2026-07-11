import type { Unit } from '../types';

const CM_PER_INCH = 2.54;
const DEFAULT_INCREMENT_IN = 1 / 8;
const SIZE_INCREMENT_IN = 0.01;

export function parseMeasurement(input: string): number {
  const value = input.trim();
  if (!value) {
    return 0;
  }

  const parts = value.split(/\s+/);
  if (parts.length === 2 && isFraction(parts[1])) {
    return Number.parseFloat(parts[0]) + parseFraction(parts[1]);
  }

  if (isFraction(value)) {
    return parseFraction(value);
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toInches(value: number, unit: Unit): number {
  return unit === 'cm' ? value / CM_PER_INCH : value;
}

export function fromInches(value: number, unit: Unit): number {
  return unit === 'cm' ? value * CM_PER_INCH : value;
}

export function roundToPrecision(value: number, increment = DEFAULT_INCREMENT_IN): number {
  return Math.round(value / increment) * increment;
}

export function roundToSizePrecision(value: number): number {
  return roundToPrecision(value, SIZE_INCREMENT_IN);
}

export function formatMeasurement(valueIn: number, unit: Unit): string {
  if (!Number.isFinite(valueIn)) {
    return unit === 'cm' ? '0.0 cm' : '0 in';
  }

  if (unit === 'cm') {
    return `${fromInches(valueIn, 'cm').toFixed(1)} cm`;
  }

  const rounded = Number(roundToPrecision(valueIn).toFixed(3));
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  let whole = Math.trunc(absolute);
  let fraction = Math.round((absolute - whole) / DEFAULT_INCREMENT_IN);

  if (fraction === 8) {
    whole += 1;
    fraction = 0;
  }

  if (fraction === 0) {
    return `${sign}${whole} in`;
  }

  const denominator = 8;
  const divisor = gcd(fraction, denominator);
  const numerator = fraction / divisor;
  const reducedDenominator = denominator / divisor;
  const fractionLabel = `${numerator}/${reducedDenominator}`;

  return whole === 0 ? `${sign}${fractionLabel} in` : `${sign}${whole} ${fractionLabel} in`;
}

export function displayValue(valueIn: number, unit: Unit): string {
  const converted = fromInches(valueIn, unit);
  return unit === 'cm' ? converted.toFixed(1) : trimNumber(roundToPrecision(converted));
}

export function displaySizeValue(valueIn: number, unit: Unit): string {
  const converted = fromInches(valueIn, unit);
  return unit === 'cm' ? converted.toFixed(1) : trimNumber(roundToSizePrecision(converted));
}

function isFraction(value: string): boolean {
  return /^\d+\/\d+$/.test(value);
}

function parseFraction(value: string): number {
  const [numerator, denominator] = value.split('/').map(Number);
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
}

function gcd(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 1;
  }

  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));

  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }

  return x || 1;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(3))}`;
}
