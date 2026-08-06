import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveDesignState, type DesignLibrary } from './designLibrary';
import { getDefaultState } from '../state/galleryState';
import { ManageDesignsDialog } from './ManageDesignsDialog';

const twoDesignLibrary: DesignLibrary = {
  activeId: 'a',
  designs: [
    {
      id: 'a',
      name: 'Living room',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'b',
      name: 'Hallway',
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
  ],
};

function renderDialog(overrides: Partial<Parameters<typeof ManageDesignsDialog>[0]> = {}) {
  return render(
    <ManageDesignsDialog
      open
      onClose={vi.fn()}
      library={twoDesignLibrary}
      onRename={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
      onNewDesign={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ManageDesignsDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    saveDesignState('a', getDefaultState());
    saveDesignState('b', getDefaultState());
  });

  it('renders nothing when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every design with its section/piece counts and marks the active one', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Manage designs' })).toBeInTheDocument();
    const livingRoomRow = screen.getByText('Living room').closest('li');
    const hallwayRow = screen.getByText('Hallway').closest('li');
    expect(livingRoomRow).not.toBeNull();
    expect(hallwayRow).not.toBeNull();

    expect(within(livingRoomRow!).getByText(/current/i)).toBeInTheDocument();
    expect(within(hallwayRow!).queryByText(/current/i)).not.toBeInTheDocument();
    expect(within(livingRoomRow!).getByText(/section.*piece/i)).toBeInTheDocument();
  });

  it('renames a design after editing and submitting the inline form', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderDialog({ onRename });

    await user.click(screen.getByRole('button', { name: 'Rename Hallway' }));
    const input = screen.getByLabelText('Design name');
    await user.clear(input);
    await user.type(input, 'Upstairs hallway');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onRename).toHaveBeenCalledWith('b', 'Upstairs hallway');
  });

  it('does not rename when the field is cleared to blank', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    renderDialog({ onRename });

    await user.click(screen.getByRole('button', { name: 'Rename Hallway' }));
    const input = screen.getByLabelText('Design name');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onRename).not.toHaveBeenCalled();
  });

  it('duplicates a design', async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    renderDialog({ onDuplicate });

    await user.click(screen.getByRole('button', { name: 'Duplicate Hallway' }));

    expect(onDuplicate).toHaveBeenCalledWith('b');
  });

  it('requires confirming before deleting a design', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderDialog({ onDelete });

    await user.click(screen.getByRole('button', { name: 'Delete Hallway' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete “Hallway”?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  it('cancels a pending delete confirmation without calling onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderDialog({ onDelete });

    await user.click(screen.getByRole('button', { name: 'Delete Hallway' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete “Hallway”?')).not.toBeInTheDocument();
  });

  it('disables delete when only one design remains', () => {
    renderDialog({
      library: { activeId: 'a', designs: [twoDesignLibrary.designs[0]] },
    });

    expect(screen.getByRole('button', { name: 'Delete Living room' })).toBeDisabled();
  });

  it('creates a new design from the footer button', async () => {
    const user = userEvent.setup();
    const onNewDesign = vi.fn();
    renderDialog({ onNewDesign });

    await user.click(screen.getByRole('button', { name: 'New design' }));

    expect(onNewDesign).toHaveBeenCalledTimes(1);
  });
});
