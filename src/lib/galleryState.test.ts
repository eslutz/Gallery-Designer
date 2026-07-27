import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultState,
  getDefaultState,
  getSelectedFeatureId,
  getSelectedPieceIds,
  loadState,
  pieceSelection,
  STORAGE_KEY,
  toPersistedState,
  withMessage,
} from './galleryState';

describe('gallery state persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['en-US'] });
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'en-US' });
  });

  it('returns the default state when nothing is persisted', () => {
    expect(loadState()).toEqual(getDefaultState());
  });

  it('falls back to the default state on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadState()).toEqual(getDefaultState());
  });

  it('falls back to the default state when the persisted shape is invalid', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sections: 'not an array' }));
    expect(loadState()).toEqual(getDefaultState());
  });

  it('round-trips sections, pieces, placements, unit, and theme, resetting the message', () => {
    const persisted = {
      ...defaultState,
      unit: 'cm',
      themeMode: 'dark',
      sections: [{ id: 'wall-1', name: 'Wall', widthIn: 50, heightIn: 40 }],
      pieces: [{ id: 'art-1', label: 'Art', widthIn: 10, heightIn: 10 }],
      placements: [{ pieceId: 'art-1', sectionId: 'wall-1', xIn: 1, yIn: 1 }],
      selectedPieceIds: ['art-1'],
      message: 'This should not survive a reload.',
      messageTone: 'error',
      messageRevision: 7,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    const loaded = loadState();

    expect(loaded.unit).toBe('cm');
    expect(loaded.themeMode).toBe('dark');
    expect(loaded.pieces).toEqual(persisted.pieces);
    expect(loaded.placements).toEqual(persisted.placements);
    expect(getSelectedPieceIds(loaded.selection)).toEqual(['art-1']);
    // The status message is session-local, not persisted across reloads.
    expect(loaded.message).toBe(defaultState.message);
    expect(loaded.messageTone).toBe(defaultState.messageTone);
    expect(loaded.messageRevision).toBe(defaultState.messageRevision);
  });

  it('drops selected ids that no longer reference a real piece', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState,
        pieces: [{ id: 'art-1', label: 'Art', widthIn: 10, heightIn: 10 }],
        selectedPieceIds: ['art-1', 'ghost-id'],
      }),
    );

    expect(getSelectedPieceIds(loadState().selection)).toEqual(['art-1']);
  });

  it('migrates a pre-shared-top-offset two-hook piece onto a single topOffsetIn', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultState,
        pieces: [
          {
            id: 'art-1',
            label: 'Art',
            widthIn: 10,
            heightIn: 10,
            hookSpec: {
              count: 2,
              leftTopOffsetIn: 4,
              leftSideOffsetIn: 5,
              rightTopOffsetIn: 7,
              rightSideOffsetIn: 6,
            },
          },
        ],
      }),
    );

    expect(loadState().pieces[0].hookSpec).toEqual({
      count: 2,
      topOffsetIn: 4,
      leftSideOffsetIn: 5,
      rightSideOffsetIn: 6,
    });
  });

  it('migrates a legacy singular selectedPieceId', () => {
    const persisted: Record<string, unknown> = { ...defaultState };
    delete persisted.selectedPieceIds;
    persisted.pieces = [{ id: 'art-1', label: 'Art', widthIn: 10, heightIn: 10 }];
    persisted.selectedPieceId = 'art-1';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    expect(getSelectedPieceIds(loadState().selection)).toEqual(['art-1']);
  });

  it('projects selection down to a plain selectedPieceIds array for persistence, dropping message fields', () => {
    const persisted = toPersistedState({
      ...defaultState,
      selection: { kind: 'feature', featureId: 'sofa-1' },
      message: 'Placed a sofa.',
      messageTone: 'info',
      messageRevision: 3,
    });

    expect(persisted).not.toHaveProperty('selection');
    expect(persisted).not.toHaveProperty('message');
    expect(persisted).not.toHaveProperty('messageTone');
    expect(persisted).not.toHaveProperty('messageRevision');
    // A feature (or no) selection has no piece ids to persist.
    expect((persisted as { selectedPieceIds: string[] }).selectedPieceIds).toEqual([]);

    const withPieces = toPersistedState({
      ...defaultState,
      selection: pieceSelection(['piece-9']),
    });
    expect((withPieces as { selectedPieceIds: string[] }).selectedPieceIds).toEqual(['piece-9']);
  });

  it('canonicalizes an empty piece-id list to "none"', () => {
    expect(pieceSelection([])).toEqual({ kind: 'none' });
    expect(pieceSelection(['a', 'b'])).toEqual({ kind: 'pieces', pieceIds: ['a', 'b'] });
    expect(getSelectedPieceIds({ kind: 'none' })).toEqual([]);
    expect(getSelectedFeatureId({ kind: 'pieces', pieceIds: ['a'] })).toBe('');
    expect(getSelectedFeatureId({ kind: 'feature', featureId: 'lamp-1' })).toBe('lamp-1');
  });

  it('bumps the revision and sets the tone on every message update', () => {
    const first = withMessage(defaultState, 'Duplicated Piece 1.');
    expect(first).toEqual({
      message: 'Duplicated Piece 1.',
      messageTone: 'info',
      messageRevision: defaultState.messageRevision + 1,
    });

    const second = withMessage({ ...defaultState, ...first }, 'Could not fit.', 'error');
    expect(second.messageRevision).toBe(defaultState.messageRevision + 2);
    expect(second.messageTone).toBe('error');
  });
});
