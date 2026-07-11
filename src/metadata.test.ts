import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const documentHead = readFileSync('index.html', 'utf8');

describe('site metadata and brand assets', () => {
  it('provides the favicon and header logo SVG assets', () => {
    expect(existsSync('public/favicon.svg')).toBe(true);
    expect(existsSync('public/gallery-wall-logo.svg')).toBe(true);
    expect(documentHead).toContain('rel="icon"');
    expect(documentHead).toContain('href="/favicon.svg"');
  });

  it('includes standard and Open Graph metadata for the production site', () => {
    expect(documentHead).toContain('name="description"');
    expect(documentHead).toContain('name="application-name" content="Gallery Designer"');
    expect(documentHead).toContain('name="theme-color" content="#245b46"');
    expect(documentHead).toContain('name="robots" content="index, follow"');
    expect(documentHead).toContain(
      'rel="canonical" href="https://gallery-designer.ericslutz.dev/"',
    );
    expect(documentHead).toContain('property="og:title"');
    expect(documentHead).toContain('property="og:description"');
    expect(documentHead).toContain('property="og:type" content="website"');
    expect(documentHead).toContain(
      'property="og:url" content="https://gallery-designer.ericslutz.dev/"',
    );
    expect(documentHead).not.toMatch(/(?:name|property)="twitter:/i);
  });
});
