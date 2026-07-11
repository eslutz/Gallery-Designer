# Self-Hosted Mona Sans and Hubot Sans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Mona Sans for interface and body text and Hubot Sans for headings without relying on an external font service.

**Architecture:** Store official WOFF2 assets and OFL license files under `public/fonts`. Define local font faces and typography role variables in the existing global stylesheet, preserving system-font fallbacks.

**Tech Stack:** Vite, React, TypeScript, CSS, Vitest

## Global Constraints

- Mona Sans is the body, control, table, measurement, and art-label family.
- Hubot Sans is the app-title, panel-title, section-heading, and wall-section-label family.
- Fonts must be self-hosted and use `font-display: swap`.
- Do not change layout, spacing, color, or font sizes.

---

### Task 1: Add and apply the font assets

**Files:**

- Create: `public/fonts/MonaSans-Variable.woff2`
- Create: `public/fonts/HubotSans-Bold.woff2`
- Create: `public/fonts/LICENSE-Mona-Sans.txt`
- Create: `public/fonts/LICENSE-Hubot-Sans.txt`
- Create: `src/styles.test.ts`
- Modify: `src/styles.css`

**Interfaces:**

- Consumes: Vite's `/public` asset serving and the existing global stylesheet import.
- Produces: `--font-interface` and `--font-heading` CSS custom properties.

- [ ] **Step 1: Add a failing stylesheet test**

Assert that `styles.css` declares both font faces, assigns Mona Sans to `:root`, and assigns Hubot Sans to heading selectors.

- [ ] **Step 2: Verify the stylesheet test fails**

Run `npm test -- src/styles.test.ts` and confirm the missing font declarations cause the failure.

- [ ] **Step 3: Add official font and license assets**

Download Mona Sans variable WOFF2 and Hubot Sans Bold WOFF2 from the official `github/mona-sans` and `github/hubot-sans` repositories, along with each OFL license.

- [ ] **Step 4: Apply the typography roles**

Add `@font-face` declarations using `font-display: swap`, set Mona Sans as `--font-interface`, set Hubot Sans as `--font-heading`, and apply the heading variable to `h1`, `h2`, `h3`, and `.section-label`.

- [ ] **Step 5: Verify and publish**

Run `npm test`, `npm run lint`, `npm run format`, `npm run build`, and `npm run test:e2e`. Confirm the fonts appear in the production build, inspect the rendered app, commit the font update, and push `main`.
