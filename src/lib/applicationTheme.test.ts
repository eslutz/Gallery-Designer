import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPLICATION_THEME,
  getApplicationThemeLabel,
  resolveApplicationTheme,
} from './applicationTheme';

describe('application theme helpers', () => {
  it('defaults to slate when no theme is configured', () => {
    expect(DEFAULT_APPLICATION_THEME).toBe('slate');
    expect(resolveApplicationTheme(undefined)).toBe('slate');
    expect(resolveApplicationTheme('')).toBe('slate');
  });

  it('normalizes the supported application theme names', () => {
    expect(resolveApplicationTheme('coastal-blue')).toBe('coastal-blue');
    expect(resolveApplicationTheme('AUBERGINE')).toBe('aubergine');
    expect(resolveApplicationTheme('terracotta')).toBe('terracotta');
    expect(resolveApplicationTheme('slate')).toBe('slate');
    expect(resolveApplicationTheme('unknown')).toBe('slate');
  });

  it('returns a human readable application theme label', () => {
    expect(getApplicationThemeLabel('evergreen')).toBe('Evergreen');
    expect(getApplicationThemeLabel('coastal-blue')).toBe('Coastal Blue');
    expect(getApplicationThemeLabel('aubergine')).toBe('Aubergine');
    expect(getApplicationThemeLabel('terracotta')).toBe('Terracotta');
    expect(getApplicationThemeLabel('slate')).toBe('Slate');
  });
});
