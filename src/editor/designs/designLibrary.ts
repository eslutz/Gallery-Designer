import { getNextDuplicateName } from './duplicateName';
import {
  getDefaultState,
  hydratePersistedState,
  isPersistedGalleryState,
  toPersistedState,
  type PersistedGalleryState,
  type GalleryState,
} from '../state/galleryState';

export const LIBRARY_KEY = 'gallery-designer-designs-v1';

// TODO(remove after next release): the pre-multi-design app stored its one
// design under this key. loadLibrary() migrates it into the new library on
// first load but leaves the original key untouched for one release as a
// safety net, in case a user needs to roll back.
const LEGACY_STATE_KEY = 'gallery-designer-state-v1';

export const designKey = (id: string) => `gallery-designer-design-${id}`;

export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignLibrary {
  activeId: string;
  designs: DesignSummary[];
}

function isDesignSummary(value: unknown): value is DesignSummary {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    typeof (value as Record<string, unknown>).createdAt === 'string' &&
    typeof (value as Record<string, unknown>).updatedAt === 'string'
  );
}

function isDesignLibrary(value: unknown): value is DesignLibrary {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).activeId === 'string' &&
    Array.isArray((value as Record<string, unknown>).designs) &&
    ((value as Record<string, unknown>).designs as unknown[]).every(isDesignSummary)
  );
}

function createId(): string {
  return `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readRawLibrary(): DesignLibrary | undefined {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as unknown;
    return isDesignLibrary(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function migrateLegacyDesign(): DesignLibrary | undefined {
  try {
    const raw = localStorage.getItem(LEGACY_STATE_KEY);
    if (!raw) {
      return undefined;
    }
    // Copy the raw string verbatim rather than re-serializing through
    // hydratePersistedState — this preserves any forward-compat fields a
    // newer app version might have written that this reader doesn't know
    // about yet.
    const id = createId();
    const timestamp = nowIso();
    localStorage.setItem(designKey(id), raw);
    const library: DesignLibrary = {
      activeId: id,
      designs: [{ id, name: 'My design', createdAt: timestamp, updatedAt: timestamp }],
    };
    saveLibrary(library);
    return library;
  } catch {
    return undefined;
  }
}

function createInitialLibrary(): DesignLibrary {
  const id = createId();
  const timestamp = nowIso();
  saveDesignState(id, getDefaultState());
  const library: DesignLibrary = {
    activeId: id,
    designs: [{ id, name: 'My design', createdAt: timestamp, updatedAt: timestamp }],
  };
  saveLibrary(library);
  return library;
}

/** Migrates the legacy single-design key and self-heals a missing/corrupt
 * library — this never throws and always returns a library with at least
 * one design. */
export function loadLibrary(): DesignLibrary {
  const existing = readRawLibrary();
  if (existing) {
    return existing;
  }
  return migrateLegacyDesign() ?? createInitialLibrary();
}

export function saveLibrary(library: DesignLibrary): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    // Persistence is a convenience; a full or unavailable store must not
    // break editing.
  }
}

/** Reads a single design's state, defaulting on any corruption so one bad
 * design blob can never take down the whole library. */
export function loadDesignState(id: string): GalleryState {
  try {
    const raw = localStorage.getItem(designKey(id));
    if (!raw) {
      return getDefaultState();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedGalleryState(parsed)) {
      return getDefaultState();
    }
    return hydratePersistedState(parsed);
  } catch {
    return getDefaultState();
  }
}

export function saveDesignState(id: string, state: GalleryState): void {
  try {
    localStorage.setItem(designKey(id), JSON.stringify(toPersistedState(state)));
  } catch {
    // Persistence is a convenience; a full or unavailable store must not
    // break editing.
  }
}

export function replaceDesignLibrary(
  library: DesignLibrary,
  states: Record<string, PersistedGalleryState>,
): void {
  const previous = readRawLibrary();
  for (const design of library.designs) {
    const state = states[design.id];
    if (!state) {
      throw new Error(`Missing state for design "${design.name}".`);
    }
    localStorage.setItem(designKey(design.id), JSON.stringify(state));
  }
  saveLibrary(library);

  for (const design of previous?.designs ?? []) {
    if (!library.designs.some((candidate) => candidate.id === design.id)) {
      localStorage.removeItem(designKey(design.id));
    }
  }
}

export function nextDesignName(library: DesignLibrary): string {
  const existingNames = new Set(library.designs.map((design) => design.name));
  let index = library.designs.length + 1;
  let candidate = `Design ${index}`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `Design ${index}`;
  }
  return candidate;
}

export function createDesign(
  library: DesignLibrary,
  name?: string,
  seed: GalleryState = getDefaultState(),
): { library: DesignLibrary; id: string } {
  const id = createId();
  const timestamp = nowIso();
  saveDesignState(id, seed);
  const nextLibrary: DesignLibrary = {
    activeId: library.activeId,
    designs: [
      ...library.designs,
      { id, name: name ?? nextDesignName(library), createdAt: timestamp, updatedAt: timestamp },
    ],
  };
  saveLibrary(nextLibrary);
  return { library: nextLibrary, id };
}

export function renameDesign(library: DesignLibrary, id: string, name: string): DesignLibrary {
  const timestamp = nowIso();
  const nextLibrary: DesignLibrary = {
    ...library,
    designs: library.designs.map((design) =>
      design.id === id ? { ...design, name, updatedAt: timestamp } : design,
    ),
  };
  saveLibrary(nextLibrary);
  return nextLibrary;
}

export function duplicateDesign(
  library: DesignLibrary,
  id: string,
): { library: DesignLibrary; id: string } {
  const source = library.designs.find((design) => design.id === id);
  const sourceState = loadDesignState(id);
  const newId = createId();
  const timestamp = nowIso();
  saveDesignState(newId, sourceState);
  const nextLibrary: DesignLibrary = {
    activeId: library.activeId,
    designs: [
      ...library.designs,
      {
        id: newId,
        name: getNextDuplicateName(
          source?.name ?? 'Design',
          library.designs.map((design) => design.name),
        ),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
  saveLibrary(nextLibrary);
  return { library: nextLibrary, id: newId };
}

/** Removes a design and, if it was the active one, switches to another —
 * creating a fresh default design if that was the only one, so the library
 * is never left empty. */
export function deleteDesign(library: DesignLibrary, id: string): DesignLibrary {
  const remaining = library.designs.filter((design) => design.id !== id);
  try {
    localStorage.removeItem(designKey(id));
  } catch {
    // Best-effort cleanup; a leftover orphaned blob is harmless.
  }

  if (remaining.length === 0) {
    const newId = createId();
    const timestamp = nowIso();
    saveDesignState(newId, getDefaultState());
    const nextLibrary: DesignLibrary = {
      activeId: newId,
      designs: [{ id: newId, name: 'My design', createdAt: timestamp, updatedAt: timestamp }],
    };
    saveLibrary(nextLibrary);
    return nextLibrary;
  }

  const nextLibrary: DesignLibrary = {
    activeId: library.activeId === id ? remaining[0].id : library.activeId,
    designs: remaining,
  };
  saveLibrary(nextLibrary);
  return nextLibrary;
}

export function setActiveDesign(library: DesignLibrary, id: string): DesignLibrary {
  const nextLibrary: DesignLibrary = { ...library, activeId: id };
  saveLibrary(nextLibrary);
  return nextLibrary;
}

export function touchDesign(library: DesignLibrary, id: string): DesignLibrary {
  const timestamp = nowIso();
  const nextLibrary: DesignLibrary = {
    ...library,
    designs: library.designs.map((design) =>
      design.id === id ? { ...design, updatedAt: timestamp } : design,
    ),
  };
  saveLibrary(nextLibrary);
  return nextLibrary;
}

export function summarizeDesign(state: GalleryState): { pieceCount: number; sectionCount: number } {
  return { pieceCount: state.pieces.length, sectionCount: state.sections.length };
}
