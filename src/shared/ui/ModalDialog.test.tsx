import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModalDialog } from './ModalDialog';

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div>
      <button type="button">Outside trigger</button>
      <ModalDialog open={open} onClose={onClose} title="Test dialog">
        <button type="button">First</button>
        <button type="button">Second</button>
      </ModalDialog>
    </div>
  );
}

describe('ModalDialog', () => {
  it('renders nothing when closed', () => {
    render(<ModalDialog open={false} onClose={vi.fn()} title="Test dialog" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders with dialog semantics and the title when open', () => {
    render(
      <ModalDialog open onClose={vi.fn()} title="Test dialog">
        <p>Body content</p>
      </ModalDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Test dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalDialog open onClose={onClose} title="Test dialog">
        <button type="button">First</button>
      </ModalDialog>,
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalDialog open onClose={onClose} title="Test dialog">
        <button type="button">First</button>
      </ModalDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss Test dialog' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the header close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalDialog open onClose={onClose} title="Test dialog">
        <button type="button">First</button>
      </ModalDialog>,
    );

    await user.click(screen.getByRole('button', { name: 'Close Test dialog' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('autofocuses the first focusable element on open', () => {
    render(
      <ModalDialog open onClose={vi.fn()} title="Test dialog">
        <button type="button">First</button>
        <button type="button">Second</button>
      </ModalDialog>,
    );

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('traps Tab focus within the dialog, wrapping from last back to first', async () => {
    const user = userEvent.setup();
    render(
      <ModalDialog open onClose={vi.fn()} title="Test dialog">
        <button type="button">First</button>
        <button type="button">Second</button>
      </ModalDialog>,
    );

    const closeButton = screen.getByRole('button', { name: 'Close Test dialog' });
    const first = screen.getByRole('button', { name: 'First' });
    const second = screen.getByRole('button', { name: 'Second' });

    expect(first).toHaveFocus();
    await user.tab();
    expect(second).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
  });

  it('restores focus to the trigger element after closing', () => {
    const { rerender } = render(<Harness open={false} onClose={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Outside trigger' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<Harness open onClose={vi.fn()} />);
    expect(trigger).not.toHaveFocus();

    rerender(<Harness open={false} onClose={vi.fn()} />);
    expect(trigger).toHaveFocus();
  });

  it('renders into document.body via a portal, not inline in the tree', () => {
    const { container } = render(
      <div data-testid="local-root">
        <ModalDialog open onClose={vi.fn()} title="Test dialog">
          <p>Body content</p>
        </ModalDialog>
      </div>,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    expect(document.body.querySelector('[role="dialog"]')).toBeInTheDocument();
  });

  it('renders optional footer content', () => {
    render(
      <ModalDialog
        open
        onClose={vi.fn()}
        title="Test dialog"
        footer={<button type="button">Do thing</button>}
      >
        <p>Body content</p>
      </ModalDialog>,
    );

    expect(screen.getByRole('button', { name: 'Do thing' })).toBeInTheDocument();
  });
});
