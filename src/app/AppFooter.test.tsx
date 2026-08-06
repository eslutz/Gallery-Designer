import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppFooter } from './AppFooter';

describe('AppFooter', () => {
  it('renders as a contentinfo landmark', () => {
    render(<AppFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('links the MIT License mention to the repo LICENSE file', () => {
    render(<AppFooter />);
    const link = screen.getByRole('link', { name: 'MIT License' });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/eslutz/Gallery-Designer/blob/main/LICENSE',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    ['GitHub', 'https://github.com/eslutz/Gallery-Designer'],
    ['Issues', 'https://github.com/eslutz/Gallery-Designer/issues'],
    ['ericslutz.dev', 'https://ericslutz.dev'],
    ['GitHub Sponsors', 'https://github.com/sponsors/eslutz'],
    ['Coindrop', 'https://coindrop.to/ericslutz_dev'],
  ])('links "%s" to %s, opening in a new tab', (name, href) => {
    render(<AppFooter />);
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
