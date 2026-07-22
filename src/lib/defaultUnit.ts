import type { Unit } from '../types';

export interface DefaultUnitInput {
  languages?: readonly string[];
  language?: string;
}

export function resolveDefaultUnit(input: DefaultUnitInput = {}): Unit {
  const locales = getCandidateLocales(input);
  const explicitRegion = locales.map(getExplicitRegion).find((region) => region !== '');

  if (explicitRegion) {
    return explicitRegion === 'US' ? 'in' : 'cm';
  }

  const inferredRegion = locales.map(getMaximizedRegion).find((region) => region !== '');
  return inferredRegion === 'US' ? 'in' : 'cm';
}

function getCandidateLocales(input: DefaultUnitInput): string[] {
  const locales = [...(input.languages ?? []), input.language ?? ''];
  return [...new Set(locales.map((locale) => locale.trim()).filter((locale) => locale.length > 0))];
}

function getExplicitRegion(locale: string): string {
  try {
    return new Intl.Locale(locale).region?.toUpperCase() ?? '';
  } catch {
    return '';
  }
}

function getMaximizedRegion(locale: string): string {
  try {
    return new Intl.Locale(locale).maximize().region?.toUpperCase() ?? '';
  } catch {
    return '';
  }
}
