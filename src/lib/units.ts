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
  if (unit === 'cm') {
    return `${fromInches(valueIn, 'cm').toFixed(1)} cm`;
  }

  const rounded = roundToPrecision(valueIn);
  const whole = Math.trunc(rounded);
  const fraction = Math.round((rounded - whole) / DEFAULT_INCREMENT_IN);

  if (fraction === 0) {
    return `${whole} in`;
  }

  const denominator = 8;
  const divisor = gcd(fraction, denominator);
  const numerator = fraction / divisor;
  const reducedDenominator = denominator / divisor;
  const fractionLabel = `${numerator}/${reducedDenominator}`;

  return whole === 0 ? `${fractionLabel} in` : `${whole} ${fractionLabel} in`;
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
  return b === 0 ? a : gcd(b, a % b);
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(3))}`;
}
