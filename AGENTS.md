# Repository Guidelines

## Project Structure & Module Organization

This is a local-first React 18 application built with Vite and strict TypeScript. `src/App.tsx` owns the editor UI and reducer state; shared types live in `src/types.ts`. Keep calculation and persistence logic in focused modules under `src/lib/`, such as `snapping.ts`, `wall.ts`, and `designFile.ts`. Tests are colocated as `*.test.ts` or `*.test.tsx`. Browser workflows live in `tests/e2e/gallery.spec.ts`. Static assets, fonts, the favicon, and GitHub Pages `CNAME` belong in `public/`. Research and implementation notes live under `docs/`.

Do not edit generated output in `dist/` or dependencies in `node_modules/`.

## Build, Test, and Development Commands

Use Node.js 24 (`nvm use`) and install from the lockfile with `npm ci`.

- `npm run dev -- --port 5175`: start the local Vite server at `http://127.0.0.1:5175`.
- `npm run build`: run TypeScript project builds and create the production bundle.
- `npm test`: run the Vitest suite once in jsdom.
- `npm run test:watch`: run Vitest interactively while developing.
- `npm run test:e2e`: run Playwright’s Chromium workflow against port 5173.
- `npm run lint`: check ESLint rules, including React Hooks and refresh constraints.
- `npm run format`: verify Prettier formatting without rewriting files.

## Coding Style & Naming Conventions

Prettier enforces two-space indentation, single quotes, semicolons, trailing commas, and a 100-character print width. Use `PascalCase` for React components and exported types, `camelCase` for functions and values, and descriptive domain names such as `applyPlacementFeatures`. Keep UI event handling in components and deterministic geometry, conversion, export, and validation logic in `src/lib/`. Preserve existing ASCII text unless user-facing copy requires otherwise.

## Testing Guidelines

Use Vitest with Testing Library for behavior and DOM assertions; use Playwright for pointer, touch, keyboard, export, and multi-step editor flows. Add regression tests beside the module or component being changed. There is no numeric coverage threshold, but changes should cover normal behavior and relevant edge cases. Before review, run `npm test`, `npm run lint`, `npm run format`, and `npm run build`; run E2E tests for interaction changes.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative subjects, for example `Fix mobile staging tray drag` and `Persist theme settings in design exports`. Keep each commit focused and avoid generated `dist/` changes unless explicitly required. Pull requests should explain user-visible behavior, list validation performed, link relevant issues, and include screenshots or recordings for layout, theme, drag-and-drop, or responsive changes. Changes merged to `main` deploy through `.github/workflows/deploy-pages.yml`.
