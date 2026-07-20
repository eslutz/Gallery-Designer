import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('src/styles.css', 'utf8');

describe('application typography', () => {
  it('self-hosts Mona Sans and Hubot Sans with swap rendering', () => {
    expect(stylesheet).toContain("font-family: 'Mona Sans'");
    expect(stylesheet).toContain("font-family: 'Hubot Sans'");
    expect(stylesheet.match(/font-display: swap/g)).toHaveLength(2);
    expect(existsSync('public/fonts/MonaSans-Variable.woff2')).toBe(true);
    expect(existsSync('public/fonts/HubotSans-Bold.woff2')).toBe(true);
  });

  it('uses Mona Sans for the interface and Hubot Sans for headings', () => {
    expect(stylesheet).toMatch(/--font-interface:\s*'Mona Sans'/);
    expect(stylesheet).toMatch(/--font-heading:\s*'Hubot Sans'/);
    expect(stylesheet).toMatch(/font-family:\s*var\(--font-interface\)/);
    expect(stylesheet).toMatch(/h1,\s*h2,\s*h3,\s*\.section-label\s*{[^}]*var\(--font-heading\)/s);
  });

  it('defines light, dark, and system-aware theme tokens', () => {
    expect(stylesheet).toMatch(/:root\s*{[^}]*color-scheme:\s*light/s);
    expect(stylesheet).toMatch(/--page-background:/);
    expect(stylesheet).toMatch(/--panel-background:/);
    expect(stylesheet).toMatch(/:root\[data-theme='dark'\]\s*{[^}]*color-scheme:\s*dark/s);
    expect(stylesheet).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  });

  it('keeps dark mode grid lines subtle and pushes the theme picker to the row end', () => {
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\s*{[^}]*--grid-line:\s*rgba\([^)]*,\s*0\.08\)/s,
    );
    expect(stylesheet).toMatch(/\.appearance-controls\s*{[^}]*margin-left:\s*auto/s);
  });

  it('prevents touch panning from taking over staged piece drags', () => {
    expect(stylesheet).toMatch(/\.staged-piece\s*{[^}]*touch-action:\s*none;/s);
  });

  it('keeps drag cursors aligned with actual canvas interactions', () => {
    expect(stylesheet).toMatch(/\.wall-pan-surface\s*{[^}]*cursor:\s*default;/s);
    expect(stylesheet).toMatch(
      /\.app-shell\.is-wall-pannable\s+\.wall-pan-surface,\s*\.wall-section-handle,\s*\.piece rect,\s*\.wall-feature-block,\s*\.staged-piece\s*{[^}]*cursor:\s*grab;/s,
    );
    expect(stylesheet).toMatch(/\.wall-section\s*{[^}]*cursor:\s*crosshair;/s);
    expect(stylesheet).toMatch(
      /\.selection-marquee,[^}]*\.group-drag-piece-preview\s*{[^}]*pointer-events:\s*none;/s,
    );
    expect(stylesheet).toMatch(
      /\.app-shell\.is-panning-wall\s+\.wall-pan-surface,[^}]*\.app-shell\.is-dragging-section \*\s*{[^}]*cursor:\s*grabbing;/s,
    );
    expect(stylesheet).toMatch(/\.wall-exterior-edge\s*{[^}]*pointer-events:\s*none;/s);
  });

  it('keeps staging content intact in constrained three-column workspaces', () => {
    expect(stylesheet).toMatch(/\.canvas-card\s*{[^}]*flex:\s*0 0 auto;/s);
    expect(stylesheet).toMatch(
      /\.staging-header\s+\.panel-title\s*{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s,
    );
    expect(stylesheet).toMatch(
      /\.staging-header\s+\.muted\s*{[^}]*flex:\s*1 1 auto;[^}]*min-width:\s*0;/s,
    );
  });

  it('lets collapsed utility panels override their grid display rule', () => {
    expect(stylesheet).toMatch(/\.collapsible-panel-content\s*{[^}]*display:\s*grid;/s);
    expect(stylesheet).toMatch(/\.collapsible-panel-content\[hidden\]\s*{[^}]*display:\s*none;/s);
  });

  it('defines the application theme selectors and matching art-piece colors', () => {
    expect(stylesheet).toMatch(/:root\[data-palette='coastal-blue'\]\s*{[^}]*--piece-fill:/s);
    expect(stylesheet).toMatch(/:root\[data-palette='aubergine'\]\s*{[^}]*--piece-fill:/s);
    expect(stylesheet).toMatch(/:root\[data-palette='terracotta'\]\s*{[^}]*--piece-fill:/s);
    expect(stylesheet).toMatch(/:root\[data-palette='slate'\]\s*{[^}]*--piece-fill:/s);
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='coastal-blue'\]\s*{[^}]*--piece-fill:/s,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='aubergine'\]\s*{[^}]*--piece-fill:/s,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='terracotta'\]\s*{[^}]*--piece-fill:/s,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='slate'\]\s*{[^}]*--piece-fill:/s,
    );
  });

  it('uses separate art label tokens for inside and outside labels', () => {
    expect(stylesheet).toMatch(/\.piece-label\s*{[^}]*fill:\s*var\(--piece-label-inside\)/s);
    expect(stylesheet).toMatch(
      /\.wall-feature-label\s*{[^}]*fill:\s*var\(--piece-label-outside\)/s,
    );
    expect(stylesheet).toMatch(
      /\.outside-piece-label\s*{[^}]*fill:\s*var\(--piece-label-outside\)/s,
    );
  });

  it('defines distinct dark-mode art colors for every application theme', () => {
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\s*{[^}]*--piece-fill:\s*#dbece2;[^}]*--piece-selected-fill:\s*#b8dbc8;[^}]*--piece-label-outside:\s*#e7f0ea;/s,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='coastal-blue'\]\s*{[^}]*--piece-fill:\s*#d7e7f6;[^}]*--piece-selected-fill:\s*#bad6ef;[^}]*--piece-label-outside:\s*#eaf2fb;/s,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='aubergine'\]\s*{[^}]*--piece-fill:\s*#e9d8f0;[^}]*--piece-selected-fill:\s*#d9bfe5;[^}]*--piece-label-outside:\s*#f3eaf8;/s,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='terracotta'\]\s*{[^}]*--piece-fill:\s*#f7dccf;[^}]*--piece-selected-fill:\s*#efc2ab;[^}]*--piece-label-outside:\s*#f8eee8;/s,
    );
    expect(stylesheet).toMatch(
      /:root\[data-theme='dark'\]\[data-palette='slate'\]\s*{[^}]*--piece-fill:\s*#d7e2ed;[^}]*--piece-selected-fill:\s*#bfcedc;[^}]*--piece-label-outside:\s*#edf3f7;/s,
    );
  });

  it('uses readable secondary controls and staging labels in the reviewed palettes', () => {
    expect(stylesheet).toMatch(
      /:root\[data-palette='terracotta'\]\s*{[^}]*--secondary-text:\s*#7d3d24/s,
    );
    expect(stylesheet).toMatch(/\.secondary\s*{[^}]*color:\s*var\(--secondary-text\)/s);
    expect(stylesheet).toMatch(/\.staged-piece\s*{[^}]*color:\s*var\(--text-primary\)/s);
  });

  it('provides reduced-motion and forced-colors fallbacks', () => {
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('@media (forced-colors: active)');
  });

  it('keeps setup content in normal page flow and gives icon controls touch-sized targets', () => {
    const collapsiblePanelRule = stylesheet.match(/\.collapsible-panel\s*{[^}]*}/s)?.[0] ?? '';
    const editorColumnRule = stylesheet.match(/\.editor-column\s*{[^}]*}/s)?.[0] ?? '';
    const measurementsPanelRule = stylesheet.match(/\.measurements-panel\s*{[^}]*}/s)?.[0] ?? '';
    const rightPanelRule = stylesheet.match(/\.right-panel\s*{[^}]*}/s)?.[0] ?? '';
    const setupPanelRule = stylesheet.match(/\.setup-panel\s*{[^}]*}/s)?.[0] ?? '';
    const responsiveEditorColumnRule =
      stylesheet
        .match(/@media\s*\(max-width:\s*1200px\)\s*{[\s\S]*?\.editor-column\s*{[^}]*}/)?.[0]
        .match(/\.editor-column\s*{[^}]*}/s)?.[0] ?? '';
    const responsiveSetupPanelRule =
      stylesheet
        .match(/@media\s*\(max-width:\s*1200px\)\s*{[\s\S]*?\.setup-panel\s*{[^}]*}/)?.[0]
        .match(/\.setup-panel\s*{[^}]*}/s)?.[0] ?? '';
    const responsiveSetupUtilityRule =
      stylesheet
        .match(/@media\s*\(max-width:\s*1200px\)\s*{[\s\S]*?\.setup-utility-panel\s*{[^}]*}/)?.[0]
        .match(/\.setup-utility-panel\s*{[^}]*}/s)?.[0] ?? '';
    const responsiveArtPiecesPanelRule =
      stylesheet
        .match(/@media\s*\(max-width:\s*1200px\)\s*{[\s\S]*?\.art-pieces-panel\s*{[^}]*}/)?.[0]
        .match(/\.art-pieces-panel\s*{[^}]*}/s)?.[0] ?? '';
    const mobileWorkspaceRule =
      stylesheet
        .match(/@media\s*\(max-width:\s*680px\)\s*{[\s\S]*?\.workspace\s*{[^}]*}/)?.[0]
        .match(/\.workspace\s*{[^}]*}/s)?.[0] ?? '';

    expect(stylesheet).toMatch(
      /\.app-shell\s*{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s,
    );
    expect(stylesheet).toMatch(
      /\.workspace\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);[^}]*align-items:\s*stretch;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(stylesheet).toMatch(/\.workspace\s*{[^}]*scroll-padding-bottom:\s*20px;/s);
    expect(stylesheet).toMatch(
      /\.setup-panel\s*{[^}]*position:\s*sticky;[^}]*align-self:\s*stretch;[^}]*max-height:\s*none;[^}]*overflow:\s*hidden;/s,
    );
    expect(stylesheet).toMatch(
      /\.wall-sections-panel\s*{[^}]*max-height:\s*min\(560px,\s*52%\);[^}]*min-height:\s*0;/s,
    );
    expect(stylesheet).toMatch(/\.wall-sections-panel\s+\.section-list\s*{[^}]*overflow:\s*auto;/s);
    expect(stylesheet).toMatch(/\.art-pieces-panel\s*{[^}]*min-height:\s*0;/s);
    expect(stylesheet).toMatch(/\.art-pieces-panel\s+\.piece-list\s*{[^}]*overflow:\s*auto;/s);
    expect(stylesheet).toMatch(/\.section-list,\s*\.piece-list\s*{[^}]*align-content:\s*start;/s);
    expect(stylesheet).toMatch(/\.setup-row\s*{[^}]*align-content:\s*start;/s);
    expect(collapsiblePanelRule).not.toContain('min-height: 0;');
    expect(editorColumnRule).toContain('align-self: stretch;');
    expect(editorColumnRule).toContain('min-height: 0;');
    expect(editorColumnRule).toContain('overflow: auto;');
    expect(editorColumnRule).toContain('overscroll-behavior: contain;');
    expect(measurementsPanelRule).toContain('flex: 0 0 auto;');
    expect(rightPanelRule).toContain('position: sticky;');
    expect(rightPanelRule).toContain('align-self: stretch;');
    expect(rightPanelRule).toContain('min-height: 0;');
    expect(rightPanelRule).toContain('overflow: auto;');
    expect(rightPanelRule).toContain('overscroll-behavior: contain;');
    expect(rightPanelRule).toContain('padding-bottom: 20px;');
    expect(setupPanelRule).toContain('position: sticky;');
    expect(setupPanelRule).toContain('overflow: hidden;');
    expect(responsiveEditorColumnRule).toContain('overflow: visible;');
    expect(responsiveSetupPanelRule).toContain('position: static;');
    expect(responsiveSetupPanelRule).toContain('flex: 0 0 auto;');
    expect(responsiveSetupPanelRule).toContain('overflow: visible;');
    expect(responsiveSetupUtilityRule).toContain('flex: 0 0 auto;');
    expect(responsiveSetupUtilityRule).toContain('overflow: visible;');
    expect(responsiveArtPiecesPanelRule).toContain('flex: 0 0 auto;');
    expect(responsiveArtPiecesPanelRule).toContain('min-height: auto;');
    expect(mobileWorkspaceRule).toContain('display: flex;');
    expect(mobileWorkspaceRule).toContain('flex-direction: column;');
    expect(stylesheet).toMatch(
      /@media\s*\(max-width:\s*680px\)\s*{[\s\S]*?\.editor-column\s*{[^}]*order:\s*-1;/,
    );
    expect(responsiveEditorColumnRule).toContain('flex: 0 0 auto;');
    expect(
      stylesheet
        .match(/@media\s*\(max-width:\s*1200px\)\s*{[\s\S]*?\.right-panel\s*{[^}]*}/)?.[0]
        .match(/\.right-panel\s*{[^}]*}/s)?.[0] ?? '',
    ).toContain('flex: 0 0 auto;');
    expect(stylesheet).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*{[\s\S]*?\.workspace\s*{[^}]*overflow:\s*auto;[\s\S]*?\.right-panel\s*{[^}]*position:\s*static;[^}]*overflow:\s*visible;/,
    );
    expect(stylesheet).toMatch(/\.icon-button\s*{[^}]*width:\s*44px;[^}]*min-height:\s*44px;/s);
  });

  it('keeps export panel typography aligned with utility panels', () => {
    const headingWithInfoRule = stylesheet.match(/\.heading-with-info\s+h3\s*{[^}]*}/s)?.[0] ?? '';

    expect(headingWithInfoRule).toContain('font-family: var(--font-interface);');
    expect(headingWithInfoRule).toContain('color: var(--text-secondary);');
    expect(headingWithInfoRule).toContain('font-size: 0.88rem;');
    expect(headingWithInfoRule).toContain('font-weight: 800;');
    expect(stylesheet).not.toMatch(/\.scale-note\s*{[^}]*font-size:/s);
  });
});
