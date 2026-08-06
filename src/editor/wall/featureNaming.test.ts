import { describe, expect, it } from 'vitest';
import {
  escapeRegExp,
  getNextWallFeatureName,
  getWallFeatureRemoveTooltip,
  isDefaultWallFeatureName,
  WALL_FEATURE_NAME_BASES,
} from './featureNaming';
import type { WallFeature } from '../../types';

function feature(overrides: Partial<WallFeature> = {}): WallFeature {
  return {
    id: 'feature-1',
    type: 'sofa',
    name: 'Sofa 1',
    xIn: 0,
    widthIn: 10,
    heightIn: 10,
    ...overrides,
  };
}

describe('wall feature naming', () => {
  it('names the first feature of a type "<Base> 1"', () => {
    expect(getNextWallFeatureName('sofa', [])).toBe('Sofa 1');
  });

  it('numbers past the highest existing default name for that type', () => {
    const features = [feature({ name: 'Sofa 1' }), feature({ id: 'f2', name: 'Sofa 3' })];
    expect(getNextWallFeatureName('sofa', features)).toBe('Sofa 4');
  });

  it('ignores default names belonging to other feature types', () => {
    const features = [feature({ type: 'bed', name: 'Bed 5' })];
    expect(getNextWallFeatureName('sofa', features)).toBe('Sofa 1');
  });

  it('ignores a custom (non-default-pattern) name when numbering', () => {
    const features = [feature({ name: 'Reading nook sofa' })];
    expect(getNextWallFeatureName('sofa', features)).toBe('Sofa 1');
  });

  it('excludes the feature being renamed from its own numbering', () => {
    const features = [feature({ id: 'f1', name: 'Sofa 2' })];
    expect(getNextWallFeatureName('sofa', features, 'f1')).toBe('Sofa 1');
  });

  it('recognizes only names matching "<Base> <number>" as default', () => {
    expect(isDefaultWallFeatureName('Sofa 1')).toBe(true);
    expect(isDefaultWallFeatureName('Sofa')).toBe(false);
    expect(isDefaultWallFeatureName('My Sofa 1')).toBe(false);
    expect(isDefaultWallFeatureName('Reading nook sofa')).toBe(false);
  });

  it('covers every configured wall feature type in the default-name check', () => {
    for (const base of Object.values(WALL_FEATURE_NAME_BASES)) {
      expect(isDefaultWallFeatureName(`${base} 1`)).toBe(true);
    }
  });

  it('lowercases the remove tooltip except for the TV acronym', () => {
    expect(getWallFeatureRemoveTooltip('sofa')).toBe('Remove sofa');
    expect(getWallFeatureRemoveTooltip('file-cabinet')).toBe('Remove file cabinet');
    expect(getWallFeatureRemoveTooltip('tv')).toBe('Remove TV');
  });

  it('escapes regex metacharacters so a base name is matched literally', () => {
    expect(escapeRegExp('a.b*c?')).toBe('a\\.b\\*c\\?');
    expect(new RegExp(`^${escapeRegExp('a.b')}$`).test('aXb')).toBe(false);
    expect(new RegExp(`^${escapeRegExp('a.b')}$`).test('a.b')).toBe(true);
  });
});
