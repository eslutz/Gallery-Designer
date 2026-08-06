// Single source of truth for the app's keyboard shortcuts. Documents what
// App.tsx's handleCanvasKeyDown (and the per-element key handlers in
// WallCanvas.tsx) actually do — see src/App.shortcuts.test.tsx, which fires
// each entry below and asserts the described effect, so a row added here
// with no matching handler fails loudly instead of silently drifting.

export type ShortcutKey = { mac: string; other: string } | string;

export interface ShortcutEntry {
  keys: ShortcutKey[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

export const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['Enter', 'Space'], description: 'Select a focused wall section, piece, or feature' },
      { keys: ['Escape'], description: 'Clear the current selection' },
      {
        keys: [{ mac: '⇧/⌘/⌥ + click', other: 'Shift/Ctrl/Alt + click' }],
        description: 'Add or remove a piece from a multi-selection',
      },
      {
        keys: [{ mac: '⇧/⌘/⌥ + drag', other: 'Shift/Ctrl/Alt + drag' }],
        description: 'Marquee-select additively',
      },
    ],
  },
  {
    title: 'Moving art',
    shortcuts: [
      {
        keys: ['←', '↑', '→', '↓'],
        description: 'Nudge the selected piece(s), section, or feature ¼ in',
      },
      {
        keys: [{ mac: '⇧ + arrow keys', other: 'Shift + arrow keys' }],
        description: 'Nudge 1 in instead of ¼ in',
      },
      {
        keys: ['Delete', 'Backspace'],
        description: 'Return the selected piece(s) or feature to the staging tray',
      },
    ],
  },
  {
    title: 'Canvas & zoom',
    shortcuts: [
      { keys: ['wheel'], description: 'Pan the wall canvas' },
      {
        keys: [{ mac: '⌘/Ctrl + wheel', other: 'Ctrl + wheel' }],
        description: 'Zoom the wall canvas',
      },
      {
        keys: [{ mac: 'Space + drag', other: 'Space + drag' }],
        description: 'Pan by dragging the wall canvas',
      },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: [{ mac: '⌘Z', other: 'Ctrl+Z' }], description: 'Undo the last change' },
      { keys: ['?'], description: 'Open this keyboard shortcuts guide' },
    ],
  },
];

export function isApplePlatform(input?: { platform?: string; userAgent?: string }): boolean {
  const platform = input?.platform ?? (typeof navigator === 'undefined' ? '' : navigator.platform);
  const userAgent =
    input?.userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return /mac|iphone|ipad|ipod/i.test(platform) || /mac|iphone|ipad|ipod/i.test(userAgent);
}

export function formatShortcutKey(key: ShortcutKey, apple: boolean): string {
  return typeof key === 'string' ? key : apple ? key.mac : key.other;
}
