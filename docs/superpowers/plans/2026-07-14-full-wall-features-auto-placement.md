# Full Wall Features Auto-Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two auto-placement wall setup modes, including full-wall mode with rule-aware furniture and wall features.

**Architecture:** Persist the user's wall setup as part of `AutoPlacementSettings`. Normalize both setup modes in `src/lib/autoPlace.ts`: available wall sections use the section union directly, while full-wall mode treats features as hard blocked rectangles plus soft rule preferences for known anchor furniture.

**Tech Stack:** React 18, Vite, strict TypeScript, Vitest, Testing Library.

## Global Constraints

- Work from the current branch.
- Do not preserve the old `above-furniture` compatibility path.
- Keep deterministic geometry in `src/lib/`.
- Use TDD for behavior changes.
- Do not edit `dist/` or `node_modules/`.

---

### Task 1: Domain Model and Rules Registry

**Files:**

- Modify: `src/types.ts`
- Create: `src/lib/wallFeatures.ts`
- Test: `src/lib/wallFeatures.test.ts`

**Interfaces:**

- Produces: `WallSetupMode`, `WallFeatureType`, `WallFeature`, `ResolvedWallFeatureRule`, `resolveWallFeatureRule(feature)`
- Consumes: existing `AutoPlacementSettings`

- [ ] Add tests for known furniture defaults and custom fallback.
- [ ] Implement the feature types and rule registry.
- [ ] Run `npm test -- src/lib/wallFeatures.test.ts --run`.

### Task 2: Solver Hard Blocks and Soft Preferences

**Files:**

- Modify: `src/lib/autoPlace.ts`
- Test: `src/lib/autoPlace.test.ts`

**Interfaces:**

- Consumes: `AutoPlacementSettings.wallSetupMode`, `AutoPlacementSettings.wallFeatures`
- Produces: placements that never overlap feature blocked rectangles plus clearance.

- [ ] Add failing tests for full-wall mode blocking furniture regions.
- [ ] Add failing tests for sofa/bed/console anchoring preferences.
- [ ] Update candidate generation and scoring to use resolved feature constraints.
- [ ] Run `npm test -- src/lib/autoPlace.test.ts --run`.

### Task 3: Persistence and Local State Validation

**Files:**

- Modify: `src/lib/designFile.ts`
- Modify: `src/App.tsx`
- Test: `src/lib/designFile.test.ts`
- Test: `src/App.test.tsx`

**Interfaces:**

- Consumes and produces design JSON with `autoPlacementSettings.wallSetupMode` and `wallFeatures`.

- [ ] Add failing round-trip tests for full-wall mode and features.
- [ ] Update design parser and app local-storage guard.
- [ ] Run `npm test -- src/lib/designFile.test.ts src/App.test.tsx --run`.

### Task 4: Editor Controls

**Files:**

- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**

- Consumes: `AutoPlacementSettings`
- Produces: controls for available wall sections versus full wall plus furniture and features.

- [ ] Add failing UI tests for selecting setup mode and adding/editing/removing a feature.
- [ ] Replace the old Context/Furniture controls with wall setup mode and feature rows.
- [ ] Show concise user-facing names: `Available wall sections`, `Full wall + furniture and features`, `Furniture & Wall Features`.
- [ ] Run `npm test -- src/App.test.tsx --run`.

### Task 5: Verification

**Files:**

- No production file changes.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run format`.
- [ ] Run `npm run build`.
