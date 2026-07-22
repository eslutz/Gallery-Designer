import { describe, expect, it } from 'vitest';
import { resolveDefaultUnit } from './defaultUnit';

describe('default measurement unit', () => {
  it('uses inches only for a United States locale', () => {
    expect(resolveDefaultUnit({ languages: ['en-US'] })).toBe('in');
  });

  it('uses centimeters for non-US locales', () => {
    expect(resolveDefaultUnit({ languages: ['en-GB'] })).toBe('cm');
    expect(resolveDefaultUnit({ languages: ['en-CA'] })).toBe('cm');
    expect(resolveDefaultUnit({ languages: ['fr-CA'] })).toBe('cm');
    expect(resolveDefaultUnit({ languages: ['fr-FR'] })).toBe('cm');
    expect(resolveDefaultUnit({ languages: ['de-DE'] })).toBe('cm');
  });

  it('uses the first explicit region in a language preference list', () => {
    expect(resolveDefaultUnit({ languages: ['fr', 'en-US'] })).toBe('in');
    expect(resolveDefaultUnit({ languages: ['fr-CA', 'en-US'] })).toBe('cm');
  });

  it('falls back to maximized language-only locales when no explicit region exists', () => {
    expect(resolveDefaultUnit({ languages: ['en'] })).toBe('in');
    expect(resolveDefaultUnit({ languages: ['fr'] })).toBe('cm');
  });

  it('uses centimeters when locale signals are missing or invalid', () => {
    expect(resolveDefaultUnit()).toBe('cm');
    expect(resolveDefaultUnit({ languages: ['not a locale'], language: 'also invalid' })).toBe(
      'cm',
    );
  });
});
