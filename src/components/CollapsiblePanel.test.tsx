import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CollapsiblePanel } from './CollapsiblePanel';

describe('CollapsiblePanel', () => {
  it('renders expanded by default with title, icon, and badge', () => {
    render(
      <CollapsiblePanel
        icon={<span data-testid="icon" />}
        title="Pieces"
        badge={3}
        ariaLabel="Pieces panel"
      >
        <p>Panel content</p>
      </CollapsiblePanel>,
    );

    expect(screen.getByRole('heading', { name: 'Pieces' })).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('3')).toHaveClass('count-badge');
    expect(screen.getByText('Panel content')).toBeVisible();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('respects defaultExpanded=false and toggles on click', async () => {
    const user = userEvent.setup();
    render(
      <CollapsiblePanel icon={null} title="Pieces" ariaLabel="Pieces panel" defaultExpanded={false}>
        <p>Panel content</p>
      </CollapsiblePanel>,
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Panel content')).not.toBeVisible();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Panel content')).toBeVisible();
  });
});
