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
  'file-cabinet': {
    clearanceIn: 4,
    preferredAnchor: 'none',
    preferredFamilies: [],
  },
  lamp: {
    clearanceIn: 3,
    preferredAnchor: 'none',
    preferredFamilies: [],
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
