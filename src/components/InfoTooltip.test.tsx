import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  FieldLabelWithInfo,
  HeadingWithInfo,
  InfoTooltipButton,
  ToggleFieldWithInfo,
  TooltipIconButton,
} from './InfoTooltip';

describe('InfoTooltipButton', () => {
  it('opens the tooltip on hover and closes it on mouse leave', async () => {
    const user = userEvent.setup();
    render(<InfoTooltipButton label="Gap" info="Space between pieces" />);

    const trigger = screen.getByRole('button', { name: 'Gap information' });
    expect(screen.getByText('Space between pieces')).not.toHaveClass('info-tooltip-open');

    await user.hover(trigger);
    expect(screen.getByText('Space between pieces')).toHaveClass('info-tooltip-open');

    await user.unhover(trigger);
    expect(screen.getByText('Space between pieces')).not.toHaveClass('info-tooltip-open');
  });

  it('closes on Escape and blurs the trigger', async () => {
    const user = userEvent.setup();
    render(<InfoTooltipButton label="Gap" info="Space between pieces" />);

    const trigger = screen.getByRole('button', { name: 'Gap information' });
    await user.click(trigger);
    expect(trigger).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.getByText('Space between pieces')).not.toHaveClass('info-tooltip-open');
    expect(trigger).not.toHaveFocus();
  });
});

describe('ToggleFieldWithInfo', () => {
  it('renders a checkbox with a paired info tooltip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToggleFieldWithInfo
        label="Show grid"
        checked={false}
        info="Toggles grid lines"
        onChange={onChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Show grid' });
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Show grid information' })).toBeInTheDocument();
  });
});

describe('TooltipIconButton', () => {
  it('renders children, calls onClick, and shows its tooltip on hover', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TooltipIconButton ariaLabel="Delete piece" tooltip="Remove this piece" onClick={onClick}>
        <span>icon</span>
      </TooltipIconButton>,
    );

    const button = screen.getByRole('button', { name: 'Delete piece' });
    await user.hover(button);
    expect(screen.getByText('Remove this piece')).toHaveClass('info-tooltip-open');

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('closes its tooltip on click, so it does not linger over whatever the click opened', async () => {
    // Tapping on touch fires focus (opening the tooltip) and click at once,
    // and nothing else blurs the button afterward for buttons that open a
    // drawer/dialog — without this, the tooltip stays rendered on top.
    const user = userEvent.setup();
    render(
      <TooltipIconButton
        ariaLabel="Auto-placement options"
        tooltip="Auto-placement options"
        onClick={vi.fn()}
      >
        <span>icon</span>
      </TooltipIconButton>,
    );

    const button = screen.getByRole('button', { name: 'Auto-placement options' });
    act(() => button.focus());
    expect(screen.getByText('Auto-placement options', { selector: '.info-tooltip' })).toHaveClass(
      'info-tooltip-open',
    );

    await user.click(button);
    expect(
      screen.getByText('Auto-placement options', { selector: '.info-tooltip' }),
    ).not.toHaveClass('info-tooltip-open');
  });
});

describe('FieldLabelWithInfo', () => {
  it('renders a label for the given input id with an info tooltip when info is provided', () => {
    render(<FieldLabelWithInfo htmlFor="width-input" label="Width" info="Width in inches" />);

    const label = screen.getByText('Width');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'width-input');
    expect(screen.getByRole('button', { name: 'Width information' })).toBeInTheDocument();
  });

  it('omits the info tooltip when no info is given', () => {
    render(<FieldLabelWithInfo htmlFor="width-input" label="Width" />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('HeadingWithInfo', () => {
  it('renders a heading paired with an info tooltip', () => {
    render(<HeadingWithInfo label="Placement" info="Auto-placement settings" />);

    expect(screen.getByRole('heading', { name: 'Placement', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Placement information' })).toBeInTheDocument();
  });
});
