/**
 * Naming for duplicated items, following the convention desktop file managers
 * use: "Piece 1" -> "Piece 1 copy" -> "Piece 1 copy 2".
 *
 * Two rules, each fixing a way the naive `${name} copy` misbehaved:
 *
 * - The copy suffix is stripped off the source before building the new name, so
 *   duplicating a duplicate gives "Piece 1 copy 2" rather than stacking up
 *   "Piece 1 copy copy copy".
 * - The result is checked against the names already in use, so duplicating the
 *   same original twice produces two distinct names instead of two items both
 *   called "Piece 1 copy".
 */

/** Matches a trailing " copy" or " copy 3", which is what makes a name a copy. */
const COPY_SUFFIX_PATTERN = / copy(?: (\d+))?$/;

/**
 * The name a set of copies is derived from — "Piece 1 copy 4" and
 * "Piece 1 copy" both trace back to "Piece 1", which keeps every copy of the
 * same original numbered in one sequence.
 */
export function getDuplicateBaseName(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(COPY_SUFFIX_PATTERN, '').trim();
  // A name that is nothing but the suffix ("copy", " copy 2") has no base to
  // fall back to, so it keeps its own name and becomes "copy copy".
  return stripped || trimmed;
}

export function getNextDuplicateName(sourceName: string, existingNames: Iterable<string>): string {
  const taken = new Set<string>();
  for (const name of existingNames) {
    taken.add(name.trim());
  }

  const base = getDuplicateBaseName(sourceName);
  let candidate = `${base} copy`;
  let index = 1;
  // Counts up to the first free name rather than past the highest in use, so
  // numbers freed by a deletion get reused instead of climbing forever.
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${base} copy ${index}`;
  }
  return candidate;
}
