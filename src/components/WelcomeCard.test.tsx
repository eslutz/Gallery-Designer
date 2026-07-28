import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeCard } from './WelcomeCard';

describe('WelcomeCard', () => {
  it('renders the orienting steps and starts with "Don\'t show this again" checked', () => {
    render(<WelcomeCard onDismiss={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Welcome to Gallery Designer' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Don.t show this again/i })).toBeChecked();
  });

  it('dismisses with dontShowAgain=true when "Start designing" is clicked with the default checkbox state', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<WelcomeCard onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Start designing' }));

    expect(onDismiss).toHaveBeenCalledWith(true);
  });

  it('dismisses with dontShowAgain=false once the checkbox is unchecked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<WelcomeCard onDismiss={onDismiss} />);

    await user.click(screen.getByRole('checkbox', { name: /Don.t show this again/i }));
    await user.click(screen.getByRole('button', { name: 'Start designing' }));

    expect(onDismiss).toHaveBeenCalledWith(false);
  });

  it('the close button dismisses using the current checkbox state too', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<WelcomeCard onDismiss={onDismiss} />);

    await user.click(screen.getByRole('checkbox', { name: /Don.t show this again/i }));
    await user.click(screen.getByRole('button', { name: 'Close welcome guide' }));

    expect(onDismiss).toHaveBeenCalledWith(false);
  });
});
