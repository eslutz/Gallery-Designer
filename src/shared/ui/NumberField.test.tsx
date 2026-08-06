import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('renders the current value formatted for the unit', () => {
    render(<NumberField label="Width" valueIn={10} unit="in" onChange={() => {}} />);

    expect(screen.getByRole('textbox', { name: 'Width' })).toHaveValue('10');
  });

  it('calls onChange with the parsed value in inches on a committed edit', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Width" valueIn={10} unit="in" onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Width' });
    await user.clear(input);
    await user.type(input, '12');

    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it('renders an info tooltip via FieldLabelWithInfo when info is provided', () => {
    render(
      <NumberField label="Width" info="Piece width" valueIn={10} unit="in" onChange={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'Width information' })).toBeInTheDocument();
  });

  it('shows a unit select and calls onUnitChange when provided', async () => {
    const user = userEvent.setup();
    const onUnitChange = vi.fn();
    render(
      <NumberField
        label="Width"
        valueIn={10}
        unit="in"
        onChange={() => {}}
        onUnitChange={onUnitChange}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Width unit' }), 'cm');

    expect(onUnitChange).toHaveBeenCalledWith('cm');
  });

  it('renders an error message with role alert', () => {
    render(
      <NumberField label="Width" valueIn={10} unit="in" onChange={() => {}} error="Too small" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Too small');
    expect(screen.getByRole('textbox', { name: 'Width' })).toHaveAttribute('aria-invalid', 'true');
  });
});
