import { describe, expect, it } from 'vitest';
import { resolveWallFeatureRule } from './wallFeatures';
import type { WallFeature } from '../types';

describe('wall feature rules', () => {
  it('resolves known furniture into blocking geometry and soft placement preferences', () => {
    const sofa: WallFeature = {
      id: 'sofa',
      type: 'sofa',
      name: 'Sofa',
      xIn: 18,
      widthIn: 84,
      heightIn: 30,
      clearanceOverrideIn: 10,
    };

    expect(resolveWallFeatureRule(sofa)).toEqual({
      blocksPlacement: true,
      clearanceIn: 10,
      preferredAnchor: 'center',
      targetGroupWidthRatio: { min: 0.6, ideal: 2 / 3, max: 0.75 },
      preferredFamilies: ['row', 'grid'],
    });
  });

  it('uses a conservative block-only fallback for custom features', () => {
    const custom: WallFeature = {
      id: 'printer-shelf',
      type: 'custom',
      name: 'Printer shelf',
      xIn: 48,
      widthIn: 24,
      heightIn: 46,
    };

    expect(resolveWallFeatureRule(custom)).toEqual({
      blocksPlacement: true,
      clearanceIn: 6,
      preferredAnchor: 'none',
      preferredFamilies: [],
    });
  });
});
