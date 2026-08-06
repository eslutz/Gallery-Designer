import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const documentHead = readFileSync('index.html', 'utf8');

describe('site metadata and brand assets', () => {
  it('provides the favicon SVG asset', () => {
    expect(existsSync('public/favicon.svg')).toBe(true);
    expect(documentHead).toContain('rel="icon"');
    expect(documentHead).toContain('href="/favicon.svg"');
    expect(documentHead).toContain('name="theme-color" content="#4b647b"');
  });

  it('includes standard and Open Graph metadata for the production site', () => {
    expect(documentHead).toContain('name="description"');
    expect(documentHead).toContain('name="application-name" content="Gallery Designer"');
    expect(documentHead).toContain('name="theme-color" content="#4b647b"');
    expect(documentHead).toContain('name="robots" content="index, follow"');
    expect(documentHead).toContain(
      'rel="canonical" href="https://gallery-designer.ericslutz.dev/"',
    );
    expect(documentHead).toContain('property="og:title"');
    expect(documentHead).toContain('property="og:description"');
    expect(documentHead).toMatch(
      /property="og:image"\s+content="https:\/\/gallery-designer\.ericslutz\.dev\/social-preview\.png"/,
    );
    expect(documentHead).toContain('property="og:image:width" content="1280"');
    expect(documentHead).toContain('property="og:image:height" content="640"');
    expect(documentHead).toMatch(
      /property="og:image:alt"\s+content="Gallery Designer app preview showing the wall planner workspace\."/,
    );
    expect(documentHead).toContain('property="og:type" content="website"');
    expect(documentHead).toContain(
      'property="og:url" content="https://gallery-designer.ericslutz.dev/"',
    );
    expect(documentHead).not.toMatch(/(?:name|property)="twitter:/i);
  });
});
