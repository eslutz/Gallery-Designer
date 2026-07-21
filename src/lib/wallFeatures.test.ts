import { describe, expect, it } from 'vitest';
import { movePlacedFeaturesWithWallSection, resolveWallFeatureRule } from './wallFeatures';
import type { WallFeature, WallSection } from '../types';

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

  it('treats file cabinets as a block-only furniture constraint', () => {
    const fileCabinet: WallFeature = {
      id: 'file-cabinet',
      type: 'file-cabinet',
      name: 'File cabinet',
      xIn: 48,
      widthIn: 30,
      heightIn: 28,
    };

    expect(resolveWallFeatureRule(fileCabinet)).toEqual({
      blocksPlacement: true,
      clearanceIn: 4,
      preferredAnchor: 'none',
      preferredFamilies: [],
    });
  });

  it('treats lamps as a small block-only furniture constraint', () => {
    const lamp: WallFeature = {
      id: 'lamp',
      type: 'lamp',
      name: 'Lamp',
      xIn: 72,
      widthIn: 14,
      heightIn: 36,
    };

    expect(resolveWallFeatureRule(lamp)).toEqual({
      blocksPlacement: true,
      clearanceIn: 3,
      preferredAnchor: 'none',
      preferredFamilies: [],
    });
  });

  it('moves only placed furniture that belongs to the moved section', () => {
    const sectionsBefore: WallSection[] = [
      { id: 'left', name: 'Left', widthIn: 80, heightIn: 60, xIn: 0, yIn: 0 },
      {
        id: 'right',
        name: 'Right',
        widthIn: 80,
        heightIn: 60,
        xIn: 80,
        yIn: 0,
      },
    ];
    const features: WallFeature[] = [
      {
        id: 'cabinet',
        type: 'file-cabinet',
        name: 'File cabinet',
        xIn: 18,
        yIn: 24,
        widthIn: 24,
        heightIn: 30,
        placed: true,
      },
      {
        id: 'lamp',
        type: 'lamp',
        name: 'Lamp',
        xIn: 98,
        yIn: 20,
        widthIn: 12,
        heightIn: 28,
        placed: true,
      },
      {
        id: 'staged',
        type: 'sofa',
        name: 'Staged sofa',
        xIn: 20,
        yIn: 20,
        widthIn: 40,
        heightIn: 24,
        placed: false,
      },
    ];
    const sectionsAfter = sectionsBefore.map((section) =>
      section.id === 'left' ? { ...section, xIn: 12, yIn: 8 } : section,
    );

    expect(
      movePlacedFeaturesWithWallSection(features, sectionsBefore, sectionsAfter, 'left'),
    ).toEqual([{ ...features[0], xIn: 30, yIn: 32 }, features[1], features[2]]);
  });
});
