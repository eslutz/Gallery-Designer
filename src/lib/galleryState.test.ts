import { beforeEach, describe, expect, it } from 'vitest';
import { defaultState, getDefaultState, loadState, STORAGE_KEY, withMessage } from './galleryState';

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
    expect(loaded.selectedPieceIds).toEqual(['art-1']);
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

    expect(loadState().selectedPieceIds).toEqual(['art-1']);
  });

  it('migrates a legacy singular selectedPieceId', () => {
    const persisted: Record<string, unknown> = { ...defaultState };
    delete persisted.selectedPieceIds;
    persisted.pieces = [{ id: 'art-1', label: 'Art', widthIn: 10, heightIn: 10 }];
    persisted.selectedPieceId = 'art-1';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    expect(loadState().selectedPieceIds).toEqual(['art-1']);
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
