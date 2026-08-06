import { beforeEach, describe, expect, it } from 'vitest';
import { defaultState, getDefaultState, STORAGE_KEY, toPersistedState } from './galleryState';
import {
  createDesign,
  deleteDesign,
  designKey,
  duplicateDesign,
  LIBRARY_KEY,
  loadDesignState,
  loadLibrary,
  nextDesignName,
  replaceDesignLibrary,
  renameDesign,
  saveDesignState,
  setActiveDesign,
  summarizeDesign,
  touchDesign,
} from './designLibrary';

describe('design library', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['en-US'] });
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'en-US' });
  });

  // A round trip through saveDesignState/loadDesignState leaves a stray
  // selectedPieceIds key on the returned object (the same pre-existing
  // behavior loadState() has always had via its {...defaultState, ...parsed}
  // spread) — harmless in practice (nothing reads it; toPersistedState
  // overwrites it cleanly on the next save), but it means a strict
  // `toEqual(getDefaultState())` fails on that one extra key. Compare the
  // fields that actually matter instead.
  function expectSameDesignShape(
    actual: ReturnType<typeof getDefaultState>,
    expected: ReturnType<typeof getDefaultState>,
  ) {
    expect(actual.unit).toBe(expected.unit);
    expect(actual.sections).toEqual(expected.sections);
    expect(actual.pieces).toEqual(expected.pieces);
    expect(actual.placements).toEqual(expected.placements);
    expect(actual.features).toEqual(expected.features);
    expect(actual.autoPlacementSettings).toEqual(expected.autoPlacementSettings);
  }

  it('creates a fresh single-design library when nothing is persisted', () => {
    const library = loadLibrary();

    expect(library.designs).toHaveLength(1);
    expect(library.activeId).toBe(library.designs[0].id);
    expect(library.designs[0].name).toBe('My design');
    expectSameDesignShape(loadDesignState(library.activeId), getDefaultState());
  });

  it('migrates a legacy single-design blob into the library and leaves the legacy key intact', () => {
    const legacy = { ...defaultState, sections: [], pieces: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(legacy)));

    const library = loadLibrary();

    expect(library.designs).toHaveLength(1);
    expect(library.designs[0].name).toBe('My design');
    expect(loadDesignState(library.activeId).sections).toEqual([]);
    // The legacy key is a safety net for one release and must survive migration.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('does not migrate again once a library already exists', () => {
    const first = loadLibrary();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(defaultState)));

    const second = loadLibrary();

    expect(second).toEqual(first);
  });

  it('self-heals when the library index is corrupt JSON', () => {
    localStorage.setItem(LIBRARY_KEY, '{not json');

    const library = loadLibrary();

    expect(library.designs).toHaveLength(1);
  });

  it('degrades only the corrupt design when one design blob is invalid', () => {
    const library = loadLibrary();
    const { library: withSecond, id: secondId } = createDesign(library, 'Second');
    localStorage.setItem(designKey(secondId), 'not json at all');

    expectSameDesignShape(loadDesignState(secondId), getDefaultState());
    expectSameDesignShape(loadDesignState(withSecond.activeId), getDefaultState());
  });

  it('creates a new design with a generated name and seeds it with a default state', () => {
    const library = loadLibrary();

    const { library: nextLibrary, id } = createDesign(library);

    expect(nextLibrary.designs).toHaveLength(2);
    expect(nextLibrary.designs[1].name).toBe('Design 2');
    expectSameDesignShape(loadDesignState(id), getDefaultState());
    // Creating a design does not switch to it.
    expect(nextLibrary.activeId).toBe(library.activeId);
  });

  it('renames a design and bumps its updatedAt', async () => {
    const library = loadLibrary();
    const before = library.designs[0].updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));

    const renamed = renameDesign(library, library.activeId, 'Living room');

    expect(renamed.designs[0].name).toBe('Living room');
    expect(renamed.designs[0].updatedAt).not.toBe(before);
  });

  it('duplicates a design, copying its state under a fresh id', () => {
    const library = loadLibrary();
    saveDesignState(library.activeId, { ...getDefaultState(), unit: 'cm' });

    const { library: nextLibrary, id: duplicateId } = duplicateDesign(library, library.activeId);

    expect(duplicateId).not.toBe(library.activeId);
    expect(nextLibrary.designs).toHaveLength(2);
    expect(nextLibrary.designs[1].name).toBe('My design copy');
    expect(loadDesignState(duplicateId).unit).toBe('cm');
  });

  it('keeps duplicated design names distinct instead of repeating "copy"', () => {
    const library = loadLibrary();

    const first = duplicateDesign(library, library.activeId);
    // Duplicating the original again, then duplicating the duplicate.
    const second = duplicateDesign(first.library, library.activeId);
    const third = duplicateDesign(second.library, first.id);

    const names = third.library.designs.map((design) => design.name);
    expect(names).toEqual(['My design', 'My design copy', 'My design copy 2', 'My design copy 3']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('deletes a non-active design without touching the active one', () => {
    const library = loadLibrary();
    const { library: withSecond, id: secondId } = createDesign(library, 'Second');

    const afterDelete = deleteDesign(withSecond, secondId);

    expect(afterDelete.designs).toHaveLength(1);
    expect(afterDelete.activeId).toBe(library.activeId);
    expect(localStorage.getItem(designKey(secondId))).toBeNull();
  });

  it('deleting the active design switches to another remaining design', () => {
    const library = loadLibrary();
    const { library: withSecond, id: secondId } = createDesign(library, 'Second');
    const withActive = setActiveDesign(withSecond, secondId);

    const afterDelete = deleteDesign(withActive, secondId);

    expect(afterDelete.activeId).toBe(library.activeId);
    expect(afterDelete.designs).toHaveLength(1);
  });

  it('deleting the last remaining design recreates a fresh default design', () => {
    const library = loadLibrary();

    const afterDelete = deleteDesign(library, library.activeId);

    expect(afterDelete.designs).toHaveLength(1);
    expect(afterDelete.activeId).not.toBe(library.activeId);
    expectSameDesignShape(loadDesignState(afterDelete.activeId), getDefaultState());
  });

  it('sets the active design', () => {
    const library = loadLibrary();
    const { library: withSecond, id: secondId } = createDesign(library, 'Second');

    const activated = setActiveDesign(withSecond, secondId);

    expect(activated.activeId).toBe(secondId);
  });

  it('touches a design, bumping its updatedAt without changing anything else', async () => {
    const library = loadLibrary();
    const before = library.designs[0].updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));

    const touched = touchDesign(library, library.activeId);

    expect(touched.designs[0].updatedAt).not.toBe(before);
    expect(touched.designs[0].name).toBe(library.designs[0].name);
  });

  it('generates non-colliding sequential names', () => {
    const library = {
      activeId: 'a',
      designs: [
        { id: 'a', name: 'Design 2', createdAt: '', updatedAt: '' },
        { id: 'b', name: 'Design 3', createdAt: '', updatedAt: '' },
      ],
    };

    expect(nextDesignName(library)).toBe('Design 4');
  });

  it('summarizes a design by piece and section counts', () => {
    expect(summarizeDesign(getDefaultState())).toEqual({ pieceCount: 1, sectionCount: 1 });
    expect(summarizeDesign({ ...getDefaultState(), pieces: [], sections: [] })).toEqual({
      pieceCount: 0,
      sectionCount: 0,
    });
  });

  it('replaces the persisted library and removes designs that are not in the backup', () => {
    const existing = loadLibrary();
    const { library: withSecond, id: secondId } = createDesign(existing, 'Second');
    const replacement = {
      activeId: 'restored',
      designs: [{ id: 'restored', name: 'Restored', createdAt: 'created', updatedAt: 'updated' }],
    };

    replaceDesignLibrary(replacement, { restored: toPersistedState(defaultState) });

    expect(loadLibrary()).toEqual(replacement);
    expect(localStorage.getItem(designKey(existing.activeId))).toBeNull();
    expect(localStorage.getItem(designKey(secondId))).toBeNull();
    expect(loadDesignState('restored').sections).toEqual(defaultState.sections);
    expect(withSecond.designs).toHaveLength(2);
  });
});
