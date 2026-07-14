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
      /\.app-shell\.is-wall-pannable\s+\.wall-pan-surface,\s*\.wall-section,\s*\.piece rect,\s*\.staged-piece\s*{[^}]*cursor:\s*grab;/s,
    );
    expect(stylesheet).toMatch(
      /\.app-shell\.is-panning-wall\s+\.wall-pan-surface,[^}]*\.app-shell\.is-dragging-section \*\s*{[^}]*cursor:\s*grabbing;/s,
    );
    expect(stylesheet).toMatch(/\.wall-exterior-edge\s*{[^}]*pointer-events:\s*none;/s);
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
    expect(stylesheet).toMatch(
      /\.setup-panel\s*{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/s,
    );
    expect(stylesheet).toMatch(/\.icon-button\s*{[^}]*width:\s*44px;[^}]*min-height:\s*44px;/s);
  });
});
