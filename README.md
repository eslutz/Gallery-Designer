# Gallery Designer

Gallery Designer is a browser-based tool for planning a gallery wall to scale. You can model a continuous wall, size and place artwork, try automatic layouts, and export measurements for installation without creating an account or sending your design to a server.

## What It Does

- Build a continuous wall from one or more connected sections, including layouts that unfold around corners.
- Add art pieces with exact dimensions and optional hook positions.
- Place pieces manually or let the auto-placement solver arrange them.
- Work with wall furniture and features when planning a full wall.
- Export the design as JSON, PNG, or PDF with installation measurements.
- Keep work local with autosave in browser storage.

## Core Features

- Local-first state: designs autosave in browser `localStorage`.
- Continuous wall canvas: connected sections behave like one unfolded wall surface.
- Manual layout tools: drag artwork, zoom and pan the wall, and refine placement visually.
- Measurement support: hook metadata and exportable hanging instructions are built in.
- Auto-placement: supports blank walls, hallway viewing paths, and full-wall layouts with furniture/features.
- Visual customization: light, dark, and themed application appearance options.

## How To Use It

1. Enter your wall sections and dimensions.
2. Add each art piece with its label, width, and height.
3. Add hook positions if you want installation measurements for the hanging hardware, not just the frame.
4. Drag pieces onto the wall for a manual layout, or run auto-placement.
5. Review the measurement table and adjust spacing, margins, or features as needed.
6. Export the finished plan as JSON, PNG, or PDF.

## Wall Setup Model

Gallery Designer treats the wall as a continuous connected surface, not as disconnected canvases. A design can use one section or multiple linked sections, which lets you model straight walls as well as layouts that wrap around corners.

There are two wall planning modes:

- `Available sections`: auto-placement uses the connected wall geometry as open hanging area.
- `Full wall with features`: auto-placement also respects furniture and wall features such as sofas, beds, desks, fireplaces, doors, windows, TVs, bookcases, and custom blocked areas.

Connected wall sections can share artwork across section boundaries as long as the placed rectangle stays fully inside the combined wall shape.

## Auto-Placement Rules

The canonical auto-placement behavior comes from the current implementation and tests, not from the deleted research notes.

### Layout selection

- If auto-placement is set to `auto` and all remaining pieces are the same size, it prefers `grid` first.
- In `auto`, the solver then considers `row`, `stack`, and `salon`.
- For mixed-size sets, `auto` also considers `packed`.
- Same-size sets tend toward `grid`.
- Mixed-size sets tend toward `salon` or `packed`.
- If you explicitly request `row`, `stack`, `grid`, or `salon`, that request is treated as a hard preference and can fail if the layout cannot fit.

### Spacing and margins

- Default gap is `2 in` for `grid`, `row`, and `stack`.
- Default gap is `3 in` for `salon`.
- If the art buffer setting has a positive value, that overrides the default gap.
- Default outer margin is `max(5 in, gap * 2)`.
- If the wall-edge buffer setting has a positive value, that overrides the default outer margin.

### Placement constraints

- Layouts must stay inside the connected wall shape.
- Pieces must not overlap or touch.
- Existing valid placements are preserved exactly; the solver places only the remaining pieces when possible.
- If an existing placement is invalid, auto-placement stops and reports the problem instead of moving pieces silently.
- A piece that cannot fit inside the wall margin fails with an explicit error.

### Full-wall features

- In `full wall with features` mode, furniture and wall features block placement.
- Each feature applies a clearance zone.
- Clearance uses the feature default unless you provide a custom override.
- Features can influence preferred layout families and anchoring behavior.

Current feature defaults:

- `sofa`, `bed`, `console`, `fireplace`: center-anchored layouts, usually favoring `row` or `grid`
- `desk`: prefers usable-span anchoring and tends toward `row` or `salon`
- `bookcase`, `tv`, `window`, `door`, `custom`: block placement but do not create a preferred anchor

### Context effects

- Blank wall planning uses the selected viewing posture, either seated or standing.
- Hallway planning uses a hallway viewing path heuristic.
- Full-wall planning reports the result in terms of the full wall plus furniture/features context.

## Export And Measurements

Gallery Designer can export:

- JSON for saving and reloading a design
- PNG for a visual snapshot
- PDF for a visual layout plus measurement instructions

Measurement instructions follow the actual app logic:

- The upper-leftmost placed piece is listed first.
- Each later piece references the nearest valid wall edge or neighboring piece on the same section.
- Top references prefer the closest surface above the piece.
- Side references prefer the closest left or right wall edge or neighboring piece.
- Hook measurements are included when hook data exists.

## Support

All support requests, bug reports, and feature requests should be submitted through [GitHub Issues](https://github.com/eslutz/Gallery-Designer/issues).

Security vulnerabilities should not be reported in public issues. Use GitHub Security Advisories instead. See [SECURITY.md](./SECURITY.md).

## Developer Notes

This project uses Node 24.

```bash
npm ci
npm run dev
npm test
npm run lint
npm run format
npm run build
npm run test:e2e
```

Implementation truth for placement behavior lives in `src/lib/autoPlace.ts`, `src/lib/placement.ts`, and the matching tests.
