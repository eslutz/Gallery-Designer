import type { WallFeature, WallFeatureType } from '../../types';

export const WALL_FEATURE_NAME_BASES: Record<WallFeatureType, string> = {
  sofa: 'Sofa',
  bed: 'Bed',
  console: 'Console',
  desk: 'Desk',
  'file-cabinet': 'File cabinet',
  lamp: 'Lamp',
  bookcase: 'Bookcase',
  fireplace: 'Fireplace',
  tv: 'TV',
  window: 'Window',
  door: 'Door',
  custom: 'Wall feature',
};

const WALL_FEATURE_DEFAULT_NAME_PATTERNS = Object.values(WALL_FEATURE_NAME_BASES).map(
  (baseName) => new RegExp(`^${escapeRegExp(baseName)} \\d+$`),
);

export function getNextWallFeatureName(
  type: WallFeatureType,
  features: WallFeature[],
  excludedFeatureId?: string,
) {
  const baseName = WALL_FEATURE_NAME_BASES[type];
  const pattern = new RegExp(`^${escapeRegExp(baseName)} (\\d+)$`);
  const maxIndex = features.reduce((currentMax, feature) => {
    if (feature.id === excludedFeatureId) {
      return currentMax;
    }
    const match = pattern.exec(feature.name);
    if (!match) {
      return currentMax;
    }
    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return `${baseName} ${maxIndex + 1}`;
}

export function isDefaultWallFeatureName(name: string) {
  return WALL_FEATURE_DEFAULT_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function getWallFeatureRemoveTooltip(type: WallFeatureType) {
  const label = WALL_FEATURE_NAME_BASES[type];
  const tooltipLabel = label === 'TV' ? label : label.toLowerCase();
  return `Remove ${tooltipLabel}`;
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
