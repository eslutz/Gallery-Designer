import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders a decorative svg logo', () => {
    const { container } = render(<BrandLogo />);

    const svg = container.querySelector('svg.brand-logo');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(container.querySelectorAll('rect')).toHaveLength(3);
  });
});
