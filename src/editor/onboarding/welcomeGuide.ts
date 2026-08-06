// Deliberately kept separate from the design library (src/editor/designs/designLibrary.ts):
// this flag is per-browser onboarding state, not part of any one design, and
// folding it into a design would leak it into designFile.ts's export/import
// round-trip.
const WELCOME_KEY = 'gallery-designer-welcome-v1';

interface WelcomeGuideState {
  seen: boolean;
}

function readState(): WelcomeGuideState {
  try {
    const raw = localStorage.getItem(WELCOME_KEY);
    if (!raw) {
      return { seen: false };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).seen === 'boolean'
    ) {
      return { seen: (parsed as WelcomeGuideState).seen };
    }
    return { seen: false };
  } catch {
    return { seen: false };
  }
}

export function hasSeenWelcome(): boolean {
  return readState().seen;
}

export function setWelcomeSeen(seen: boolean): void {
  try {
    localStorage.setItem(WELCOME_KEY, JSON.stringify({ seen }));
  } catch {
    // Persistence is a convenience; a full or unavailable store must not
    // break editing. Worst case the welcome card reappears next load.
  }
}
