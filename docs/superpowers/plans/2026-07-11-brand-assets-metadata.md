# Brand Assets and Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact frame-and-ruler favicon, an L-shaped gallery-wall header logo, and complete standard metadata without Twitter card tags.

**Architecture:** Keep both marks as deterministic project-local SVG files in `public`. Reference the favicon and production metadata from `index.html`, and render the decorative logo beside the existing accessible text title.

**Tech Stack:** Vite, React, TypeScript, SVG, CSS, Vitest

## Global Constraints

- The favicon must use a simple picture-frame/ruler symbol that remains readable at 16 px.
- The header logo must use a small L-shaped gallery wall with framed art.
- Use the existing green and warm off-white palette.
- Include standard description, canonical, robots, theme, application, and Open Graph metadata.
- Do not include Twitter card metadata.

---

### Task 1: Add favicon, header logo, and metadata

**Files:**

- Create: `public/favicon.svg`
- Create: `public/gallery-wall-logo.svg`
- Create: `src/metadata.test.ts`
- Modify: `index.html`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**

- Consumes: Vite public assets and the existing `.topbar` header.
- Produces: `/favicon.svg`, `/gallery-wall-logo.svg`, metadata in the document head, and `.brand-lockup` header layout.

- [ ] **Step 1: Add failing metadata and header-logo tests**

Verify the favicon and logo files exist, standard metadata is present, no Twitter tags exist, and the header renders the decorative logo.

- [ ] **Step 2: Verify the tests fail for missing assets and tags**

Run `npm test -- src/metadata.test.ts src/App.test.tsx` and confirm failures are caused by the missing branding implementation.

- [ ] **Step 3: Add the SVG assets and metadata**

Create the two SVG files, reference the favicon, and add canonical, description, robots, theme color, application name, and Open Graph tags to `index.html`.

- [ ] **Step 4: Add the header logo**

Render `/gallery-wall-logo.svg` as an empty-alt decorative image beside the title and add responsive `.brand-lockup` and `.brand-logo` styles without changing header copy.

- [ ] **Step 5: Verify the complete app**

Run unit tests, lint, format, build, E2E tests when available, and rendered browser checks for metadata, logo visibility, favicon loading, and console health.
