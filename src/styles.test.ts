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
});
