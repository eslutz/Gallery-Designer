import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DesignSwitcher } from './DesignSwitcher';

const designs = [
  { id: 'a', name: 'Living room', createdAt: '', updatedAt: '' },
  { id: 'b', name: 'Hallway', createdAt: '', updatedAt: '' },
];

describe('DesignSwitcher', () => {
  it('shows the active design name on the trigger and is closed by default', () => {
    render(
      <DesignSwitcher
        activeDesignId="a"
        designs={designs}
        onSwitch={vi.fn()}
        onNewDesign={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Living room/i })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu, lists every design, and marks the active one checked', async () => {
    const user = userEvent.setup();
    render(
      <DesignSwitcher
        activeDesignId="a"
        designs={designs}
        onSwitch={vi.fn()}
        onNewDesign={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Living room/i }));

    expect(screen.getByRole('menu', { name: 'Designs' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Living room' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Hallway' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('switches to a different design and closes the menu', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(
      <DesignSwitcher
        activeDesignId="a"
        designs={designs}
        onSwitch={onSwitch}
        onNewDesign={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Living room/i }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Hallway' }));

    expect(onSwitch).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not call onSwitch when clicking the already-active design', async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(
      <DesignSwitcher
        activeDesignId="a"
        designs={designs}
        onSwitch={onSwitch}
        onNewDesign={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Living room/i }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Living room' }));

    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('calls onNewDesign and onManage from their menu items', async () => {
    const user = userEvent.setup();
    const onNewDesign = vi.fn();
    const onManage = vi.fn();
    render(
      <DesignSwitcher
        activeDesignId="a"
        designs={designs}
        onSwitch={vi.fn()}
        onNewDesign={onNewDesign}
        onManage={onManage}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Living room/i }));
    await user.click(screen.getByRole('menuitem', { name: 'New design' }));
    expect(onNewDesign).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Living room/i }));
    await user.click(screen.getByRole('menuitem', { name: /Manage designs/i }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('closes the menu when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outside</button>
        <DesignSwitcher
          activeDesignId="a"
          designs={designs}
          onSwitch={vi.fn()}
          onNewDesign={vi.fn()}
          onManage={vi.fn()}
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /Living room/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
