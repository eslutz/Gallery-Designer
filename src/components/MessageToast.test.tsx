import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageToast } from './MessageToast';

describe('MessageToast', () => {
  it('keeps the live region mounted but renders no toast when not visible', () => {
    const { container } = render(
      <MessageToast message="Saved" tone="info" visible={false} onDismiss={() => {}} />,
    );

    const region = container.querySelector('.message-toast-region');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('role', 'status');
    expect(container.querySelector('.message-toast')).toBeNull();
  });

  it('renders an info toast with its message and hidden details', () => {
    render(
      <MessageToast
        message="Saved successfully"
        details="Design saved to your browser"
        tone="info"
        visible
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect(screen.getByText('Design saved to your browser')).toHaveClass('visually-hidden');
  });

  it('renders an error toast with the warning icon', () => {
    const { container } = render(
      <MessageToast message="Something failed" tone="error" visible onDismiss={() => {}} />,
    );

    expect(container.querySelector('.message-toast.error')).not.toBeNull();
  });

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<MessageToast message="Saved" tone="info" visible onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss notification: Saved' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
