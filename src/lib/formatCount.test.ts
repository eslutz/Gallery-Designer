import { describe, expect, it } from 'vitest';
import { formatCount } from './formatCount';

describe('formatCount', () => {
  it('pluralizes based on count', () => {
    expect(formatCount(1, 'fixed piece')).toBe('1 fixed piece');
    expect(formatCount(2, 'fixed piece')).toBe('2 fixed pieces');
    expect(formatCount(0, 'fixed piece')).toBe('0 fixed pieces');
  });
});
