import { useEffect, useId, useState } from 'react';
import {
  displaySizeValue,
  displayValue,
  parseMeasurement,
  roundToPrecision,
  roundToSizePrecision,
  toInches,
} from '../lib/units';
import type { Unit } from '../types';
import { FieldLabelWithInfo } from './InfoTooltip';

export function NumberField({
  label,
  displayLabel,
  info,
  valueIn,
  unit,
  precision = 'position',
  disabled = false,
  error,
  onUnitChange,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  label: string;
  displayLabel?: string;
  info?: string;
  valueIn: number;
  unit: Unit;
  precision?: 'position' | 'size';
  disabled?: boolean;
  error?: string;
  onUnitChange?: (unit: Unit) => void;
  onChange: (valueIn: number) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}) {
  const visibleLabel = displayLabel ?? label;
  const display =
    precision === 'size' ? displaySizeValue(valueIn, unit) : displayValue(valueIn, unit);
  const round = precision === 'size' ? roundToSizePrecision : roundToPrecision;
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!focused) {
      setDraft(display);
    }
  }, [display, focused]);

  const input = (
    <span className="number-input-with-unit">
      <input
        id={inputId}
        aria-label={label}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        inputMode="decimal"
        value={draft}
        onFocus={() => {
          onEditStart?.();
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          setDraft(display);
          onEditEnd?.();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next === '' || next === '-' || next.endsWith('.')) {
            return;
          }
          onChange(round(toInches(parseMeasurement(next), unit)));
        }}
      />
      {onUnitChange ? (
        <select
          className="inline-unit-select"
          aria-label={`${label} unit`}
          value={unit}
          onChange={(event) => onUnitChange(event.target.value as Unit)}
        >
          <option value="in">in</option>
          <option value="cm">cm</option>
        </select>
      ) : null}
    </span>
  );
  const errorMessage = error ? (
    <span id={errorId} className="field-error" role="alert">
      {error}
    </span>
  ) : null;

  return info ? (
    <div className="field">
      <FieldLabelWithInfo htmlFor={inputId} label={visibleLabel} info={info} />
      {input}
      {errorMessage}
    </div>
  ) : (
    <label className="field">
      {visibleLabel}
      {input}
      {errorMessage}
    </label>
  );
}
