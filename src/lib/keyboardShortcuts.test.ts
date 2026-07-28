import { describe, expect, it } from 'vitest';
import { formatShortcutKey, isApplePlatform, shortcutGroups } from './keyboardShortcuts';

describe('isApplePlatform', () => {
  it('detects mac/iphone/ipad platforms', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isApplePlatform({ platform: '', userAgent: 'iPhone' })).toBe(true);
    expect(isApplePlatform({ platform: 'iPad', userAgent: '' })).toBe(true);
  });

  it('returns false for non-Apple platforms', () => {
    expect(isApplePlatform({ platform: 'Win32', userAgent: 'Windows NT 10.0' })).toBe(false);
    expect(isApplePlatform({ platform: 'Linux x86_64', userAgent: 'X11; Linux' })).toBe(false);
  });
});

describe('formatShortcutKey', () => {
  it('passes through plain string keys unchanged', () => {
    expect(formatShortcutKey('Escape', true)).toBe('Escape');
    expect(formatShortcutKey('Escape', false)).toBe('Escape');
  });

  it('picks the mac or other variant of a platform-specific key', () => {
    const key = { mac: '⌘Z', other: 'Ctrl+Z' };
    expect(formatShortcutKey(key, true)).toBe('⌘Z');
    expect(formatShortcutKey(key, false)).toBe('Ctrl+Z');
  });
});

describe('shortcutGroups', () => {
  it('has at least one group with at least one shortcut', () => {
    expect(shortcutGroups.length).toBeGreaterThan(0);
    for (const group of shortcutGroups) {
      expect(group.shortcuts.length).toBeGreaterThan(0);
      for (const shortcut of group.shortcuts) {
        expect(shortcut.keys.length).toBeGreaterThan(0);
        expect(shortcut.description.length).toBeGreaterThan(0);
      }
    }
  });
});
