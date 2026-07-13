# Gallery Designer Review Remediation Implementation Plan

**Goal:** Complete the seven-phase remediation backlog from the Gallery Designer accessibility, UX, responsive, React, and frontend review.

**Architecture:** Preserve the existing single-route React editor and keep deterministic geometry in `src/lib/`. Add small validation and persistence helpers rather than introducing a state library. Keep the SVG as the visual canvas, but expose every interactive canvas item as a real keyboard-operable control with local selection and movement handlers.

**Tech Stack:** React 18, strict TypeScript, Vite, Vitest/Testing Library, Playwright, CSS custom properties.

## Global Constraints

- Preserve the existing user changes in `src/App.tsx`, `src/App.test.tsx`, and `src/styles.css`.
- Do not edit `dist/` or `node_modules/`.
- Use Node.js 24 and the existing npm scripts.
- Write regression tests before each behavior change and verify the failing test before implementation.
- Do not claim WCAG conformance; validate the specific remediated criteria and state remaining manual limitations.

## Phase 0: Immediate blockers

1. Add failing placement tests for out-of-bounds and overlap rejection, then make `getPlacementIssues()` validate those cases and wire export readiness to it.
2. Add failing keyboard tests for section and placed-piece activation, movement, and focus visibility; implement local SVG keyboard handlers and selected-state semantics.
3. Add failing theme-token tests for Dark Slate staging-label contrast and Light Terracotta secondary-button contrast; correct tokens and focus/active styling.

## Phase 1: Shared accessibility foundations

1. Add failing tests for visible/live status messages and issue announcements; render `state.message` and export issues through explicit status/error regions.
2. Add failing accessible-name tests for every section corner select and piece hook select; include section/piece context in labels.
3. Extend `NumberField` with field identity, invalid state, described-by support, and inline error rendering; add tests for zero and malformed dimensions.
4. Add tests for selected-state exposure and ensure focus indicators cover SVG controls.

## Phase 2: Primary user flows

1. Add a measurements empty-state branch and test initial/reset behavior.
2. Add one-step undo state for Reset wall, Remove piece, and Auto-place; test recovery without changing normal placement behavior.
3. Add local-persistence copy and feature helper text; test that the copy is present and accurate.

## Phase 3: React correctness and robustness

1. Scope arrow-key handling to the focused canvas item and test that toolbar, form, and section focus cannot move a selected piece.
2. Harden `loadState()` and persistence writes against malformed data and storage exceptions; add focused tests.
3. Replace coordinate-only exterior-edge keys with stable unique keys and add a multi-section console-warning regression test.

## Phase 4: Responsive and component consistency

1. Add responsive tests at 1024px, 1100px, and 1199px; adjust the layout breakpoint and column minimums to eliminate document overflow.
2. Add a mobile measurement-card presentation below 680px while retaining the semantic desktop table.
3. Remove the competing setup-panel scroll trap, disable inactive buffer-gap fields, and add tests for both behaviors.
4. Reorder or collapse mobile setup content so the wall canvas and primary action are reachable early.

## Phase 5: UX refinement

1. Group toolbar controls into placement, view, and appearance clusters without changing the existing actions.
2. Add concise explanations for snapping and buffer features.
3. Add explicit empty, error, success, and persistence states and test the primary journey end to end.

## Phase 6: Performance and maintainability

1. Add a failing bundle/runtime assertion only where measurable; dynamically import `jspdf` from the PDF action.
2. Stabilize global pointer/keyboard listener registration and avoid recomputing section offsets for every drag-preview render.
3. Add a fixture-based drag regression test and rerun the production build to confirm the initial bundle warning is reduced.

## Phase 7: Visual polish and verification

1. Reduce secondary text weight, add hover/active/focus-visible states, enlarge mobile icon targets, and handle long canvas labels without unreadable text.
2. Add `prefers-reduced-motion` and `forced-colors` safeguards.
3. Run unit, lint, format, build, E2E, keyboard, theme, responsive, and rendered browser verification across all remediated requirements.
