import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { shortcutGroups } from './keyboardShortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';

describe('ShortcutsDialog', () => {
  it('renders nothing when closed', () => {
    render(<ShortcutsDialog open={false} onClose={vi.fn()} onShowWelcomeGuide={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every shortcut group and shortcut description when open', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} onShowWelcomeGuide={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    for (const group of shortcutGroups) {
      expect(screen.getByRole('heading', { name: group.title, level: 3 })).toBeInTheDocument();
      for (const shortcut of group.shortcuts) {
        expect(screen.getByText(shortcut.description)).toBeInTheDocument();
      }
    }
  });

  it('closes and opens the welcome guide when the footer button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onShowWelcomeGuide = vi.fn();
    render(<ShortcutsDialog open onClose={onClose} onShowWelcomeGuide={onShowWelcomeGuide} />);

    await user.click(screen.getByRole('button', { name: 'Show welcome guide' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onShowWelcomeGuide).toHaveBeenCalledTimes(1);
  });
});
