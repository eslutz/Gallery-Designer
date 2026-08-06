import { describe, expect, it } from 'vitest';
import { getDuplicateBaseName, getNextDuplicateName } from './duplicateName';

describe('getDuplicateBaseName', () => {
  it('leaves a name that is not a copy alone', () => {
    expect(getDuplicateBaseName('Piece 1')).toBe('Piece 1');
  });

  it('traces a copy back to what it was copied from', () => {
    expect(getDuplicateBaseName('Piece 1 copy')).toBe('Piece 1');
    expect(getDuplicateBaseName('Piece 1 copy 4')).toBe('Piece 1');
  });

  it('keeps a name whose own words end in copy', () => {
    // "copy" here is the name, not a suffix on something else.
    expect(getDuplicateBaseName('copy')).toBe('copy');
  });

  it('does not mistake a trailing number for a copy suffix', () => {
    expect(getDuplicateBaseName('Piece 2')).toBe('Piece 2');
  });
});

describe('getNextDuplicateName', () => {
  it('names the first duplicate of an original', () => {
    expect(getNextDuplicateName('Piece 1', ['Piece 1'])).toBe('Piece 1 copy');
  });

  it('numbers the next duplicate instead of colliding with the first', () => {
    // The bug this replaces: duplicating the original twice produced two
    // items both called "Piece 1 copy".
    expect(getNextDuplicateName('Piece 1', ['Piece 1', 'Piece 1 copy'])).toBe('Piece 1 copy 2');
  });

  it('numbers a copy of a copy rather than stacking suffixes', () => {
    // ...and the other half of the bug: "Piece 1 copy copy".
    expect(getNextDuplicateName('Piece 1 copy', ['Piece 1', 'Piece 1 copy'])).toBe(
      'Piece 1 copy 2',
    );
  });

  it('keeps one sequence per original, whichever copy is duplicated', () => {
    const existing = ['Piece 1', 'Piece 1 copy', 'Piece 1 copy 2'];

    expect(getNextDuplicateName('Piece 1', existing)).toBe('Piece 1 copy 3');
    expect(getNextDuplicateName('Piece 1 copy', existing)).toBe('Piece 1 copy 3');
    expect(getNextDuplicateName('Piece 1 copy 2', existing)).toBe('Piece 1 copy 3');
  });

  it('reuses a number freed by deleting a copy', () => {
    expect(getNextDuplicateName('Piece 1', ['Piece 1', 'Piece 1 copy 2'])).toBe('Piece 1 copy');
  });

  it('keeps separate originals in separate sequences', () => {
    const existing = ['Piece 1', 'Piece 1 copy', 'Sunset'];

    expect(getNextDuplicateName('Sunset', existing)).toBe('Sunset copy');
  });

  it('ignores surrounding whitespace when checking what is taken', () => {
    expect(getNextDuplicateName('Piece 1', ['  Piece 1 copy  '])).toBe('Piece 1 copy 2');
  });

  it('still produces a name when nothing exists yet', () => {
    expect(getNextDuplicateName('Piece 1', [])).toBe('Piece 1 copy');
  });
});
