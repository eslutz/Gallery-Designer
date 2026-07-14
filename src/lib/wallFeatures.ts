import type { AutoPlacementLayoutPreference, WallFeature, WallFeatureType } from '../types';

export type WallFeatureAnchor = 'center' | 'usable-span' | 'none';

export interface ResolvedWallFeatureRule {
  blocksPlacement: boolean;
  clearanceIn: number;
  preferredAnchor: WallFeatureAnchor;
  targetGroupWidthRatio?: {
    min: number;
    ideal: number;
    max: number;
  };
  preferredFamilies: Exclude<AutoPlacementLayoutPreference, 'auto'>[];
}

interface WallFeatureRuleDefaults {
  clearanceIn: number;
  preferredAnchor: WallFeatureAnchor;
  targetGroupWidthRatio?: ResolvedWallFeatureRule['targetGroupWidthRatio'];
  preferredFamilies: ResolvedWallFeatureRule['preferredFamilies'];
}

const DEFAULT_FEATURE_CLEARANCE_IN = 6;

const FEATURE_RULES: Record<WallFeatureType, WallFeatureRuleDefaults> = {
  sofa: {
    clearanceIn: 8,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.6, ideal: 2 / 3, max: 0.75 },
    preferredFamilies: ['row', 'grid'],
  },
  bed: {
    clearanceIn: 8,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.6, ideal: 0.7, max: 0.8 },
    preferredFamilies: ['row', 'grid'],
  },
  console: {
    clearanceIn: 8,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.6, ideal: 2 / 3, max: 0.75 },
    preferredFamilies: ['row', 'grid'],
  },
  desk: {
    clearanceIn: 10,
    preferredAnchor: 'usable-span',
    targetGroupWidthRatio: { min: 0.45, ideal: 0.6, max: 0.75 },
    preferredFamilies: ['row', 'salon'],
  },
  bookcase: {
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  fireplace: {
    clearanceIn: 12,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.55, ideal: 0.65, max: 0.8 },
    preferredFamilies: ['row', 'grid'],
  },
  tv: {
    clearanceIn: 6,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  window: {
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  door: {
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  custom: {
    clearanceIn: DEFAULT_FEATURE_CLEARANCE_IN,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
};

export function resolveWallFeatureRule(feature: WallFeature): ResolvedWallFeatureRule {
  const defaults = FEATURE_RULES[feature.type] ?? FEATURE_RULES.custom;
  return {
    blocksPlacement: true,
    clearanceIn: Math.max(0, feature.clearanceOverrideIn ?? defaults.clearanceIn),
    preferredAnchor: defaults.preferredAnchor,
    targetGroupWidthRatio: defaults.targetGroupWidthRatio,
    preferredFamilies: defaults.preferredFamilies,
  };
}
