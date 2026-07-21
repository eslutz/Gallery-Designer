import type {
  AutoPlacementLayoutPreference,
  WallFeature,
  WallFeatureType,
  WallSection,
} from '../types';
import { getWallBounds, getWallLayout } from './wall';
import { roundToPrecision } from './units';

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
  widthIn: number;
  heightIn: number;
  clearanceIn: number;
  preferredAnchor: WallFeatureAnchor;
  targetGroupWidthRatio?: ResolvedWallFeatureRule['targetGroupWidthRatio'];
  preferredFamilies: ResolvedWallFeatureRule['preferredFamilies'];
}

interface WallFeatureDefaults {
  widthIn: number;
  heightIn: number;
  clearanceOverrideIn: number;
}

const DEFAULT_FEATURE_CLEARANCE_IN = 6;

const FEATURE_RULES: Record<WallFeatureType, WallFeatureRuleDefaults> = {
  sofa: {
    widthIn: 84,
    heightIn: 30,
    clearanceIn: 8,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.6, ideal: 2 / 3, max: 0.75 },
    preferredFamilies: ['row', 'grid'],
  },
  bed: {
    widthIn: 60,
    heightIn: 48,
    clearanceIn: 8,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.6, ideal: 0.7, max: 0.8 },
    preferredFamilies: ['row', 'grid'],
  },
  console: {
    widthIn: 60,
    heightIn: 32,
    clearanceIn: 8,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.6, ideal: 2 / 3, max: 0.75 },
    preferredFamilies: ['row', 'grid'],
  },
  desk: {
    widthIn: 48,
    heightIn: 30,
    clearanceIn: 10,
    preferredAnchor: 'usable-span',
    targetGroupWidthRatio: { min: 0.45, ideal: 0.6, max: 0.75 },
    preferredFamilies: ['row', 'salon'],
  },
  'file-cabinet': {
    widthIn: 18,
    heightIn: 28,
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  lamp: {
    widthIn: 14,
    heightIn: 60,
    clearanceIn: 3,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  bookcase: {
    widthIn: 30,
    heightIn: 72,
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  fireplace: {
    widthIn: 48,
    heightIn: 42,
    clearanceIn: 12,
    preferredAnchor: 'center',
    targetGroupWidthRatio: { min: 0.55, ideal: 0.65, max: 0.8 },
    preferredFamilies: ['row', 'grid'],
  },
  tv: {
    widthIn: 55,
    heightIn: 32,
    clearanceIn: 6,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  window: {
    widthIn: 36,
    heightIn: 48,
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  door: {
    widthIn: 32,
    heightIn: 80,
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  custom: {
    widthIn: 36,
    heightIn: 36,
    clearanceIn: DEFAULT_FEATURE_CLEARANCE_IN,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
};

export function getWallFeatureDefaults(type: WallFeatureType): WallFeatureDefaults {
  const defaults = FEATURE_RULES[type] ?? FEATURE_RULES.custom;
  return {
    widthIn: defaults.widthIn,
    heightIn: defaults.heightIn,
    clearanceOverrideIn: defaults.clearanceIn,
  };
}

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

export function movePlacedFeaturesWithWallSection(
  features: WallFeature[],
  sectionsBefore: WallSection[],
  sectionsAfter: WallSection[],
  sectionId: string,
): WallFeature[] {
  const previousLayout = getWallLayout(sectionsBefore).find(
    (layout) => layout.section.id === sectionId,
  );
  const nextLayout = getWallLayout(sectionsAfter).find((layout) => layout.section.id === sectionId);
  if (!previousLayout || !nextLayout) {
    return features;
  }

  const deltaXIn = nextLayout.offsetXIn - previousLayout.offsetXIn;
  const deltaYIn = nextLayout.offsetYIn - previousLayout.offsetYIn;
  if (deltaXIn === 0 && deltaYIn === 0) {
    return features;
  }

  return features.map((feature) => {
    if (feature.placed === false) {
      return feature;
    }

    const yIn = feature.yIn ?? getLegacyFeatureYIn(feature, sectionsBefore);
    const centerXIn = feature.xIn + feature.widthIn / 2;
    const centerYIn = yIn + feature.heightIn / 2;
    const { section, offsetXIn, offsetYIn } = previousLayout;
    const belongsToSection =
      centerXIn >= offsetXIn &&
      centerXIn <= offsetXIn + section.widthIn &&
      centerYIn >= offsetYIn &&
      centerYIn <= offsetYIn + section.heightIn;

    return belongsToSection
      ? {
          ...feature,
          xIn: roundToPrecision(feature.xIn + deltaXIn),
          yIn: roundToPrecision(yIn + deltaYIn),
        }
      : feature;
  });
}

function getLegacyFeatureYIn(feature: WallFeature, sections: WallSection[]): number {
  const bounds = getWallBounds(sections);
  return bounds.maxY - feature.heightIn - resolveWallFeatureRule(feature).clearanceIn;
}
