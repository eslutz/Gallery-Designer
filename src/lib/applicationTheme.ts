export type ApplicationTheme = 'evergreen' | 'coastal-blue' | 'aubergine' | 'terracotta' | 'slate';

export const DEFAULT_APPLICATION_THEME: ApplicationTheme = 'slate';

const applicationThemeLabels: Record<ApplicationTheme, string> = {
  evergreen: 'Evergreen',
  'coastal-blue': 'Coastal Blue',
  aubergine: 'Aubergine',
  terracotta: 'Terracotta',
  slate: 'Slate',
};

export const applicationThemeOptions: Array<{ value: ApplicationTheme; label: string }> = [
  { value: 'aubergine', label: 'Aubergine' },
  { value: 'coastal-blue', label: 'Coastal Blue' },
  { value: 'evergreen', label: 'Evergreen' },
  { value: 'slate', label: 'Slate' },
  { value: 'terracotta', label: 'Terracotta' },
];

export function resolveApplicationTheme(value: string | undefined): ApplicationTheme {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'evergreen' ||
    normalized === 'coastal-blue' ||
    normalized === 'aubergine' ||
    normalized === 'terracotta' ||
    normalized === 'slate'
  ) {
    return normalized;
  }

  return DEFAULT_APPLICATION_THEME;
}

export function getApplicationThemeLabel(theme: ApplicationTheme): string {
  return applicationThemeLabels[theme];
}
