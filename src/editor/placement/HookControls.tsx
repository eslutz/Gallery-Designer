import type { ArtPiece, HookSpec, Unit } from '../../types';
import { NumberField } from '../../shared/ui/NumberField';

export function HookControls({
  piece,
  unit,
  onUnitChange,
  onChange,
  onEditStart,
  onEditEnd,
  onImmediateChange,
}: {
  piece: ArtPiece;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onChange: (hookSpec: HookSpec | undefined) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  onImmediateChange?: () => void;
}) {
  const count = piece.hookSpec?.count ?? 0;

  return (
    <div className="hook-controls">
      <label className="field">
        Hooks
        <select
          aria-label={`Hooks for ${piece.label}`}
          value={count}
          onChange={(event) => {
            onImmediateChange?.();
            const next = Number(event.target.value);
            if (next === 0) {
              onChange(undefined);
            } else if (next === 1) {
              onChange({ count: 1, topOffsetIn: 2, leftOffsetIn: piece.widthIn / 2 });
            } else {
              onChange({
                count: 2,
                topOffsetIn: 2,
                leftSideOffsetIn: 3,
                rightSideOffsetIn: 3,
              });
            }
          }}
        >
          <option value={0}>None</option>
          <option value={1}>1 hook</option>
          <option value={2}>2 hooks</option>
        </select>
      </label>
      {piece.hookSpec?.count === 1 ? (
        <div className="field-grid">
          <NumberField
            label={`${piece.label} hook down from top`}
            displayLabel="Down from top"
            valueIn={piece.hookSpec.topOffsetIn}
            unit={unit}
            onUnitChange={onUnitChange}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(topOffsetIn) => onChange({ ...piece.hookSpec!, topOffsetIn } as HookSpec)}
          />
          <NumberField
            label={`${piece.label} hook from left side`}
            displayLabel="From left side"
            valueIn={piece.hookSpec.leftOffsetIn}
            unit={unit}
            onUnitChange={onUnitChange}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(leftOffsetIn) => onChange({ ...piece.hookSpec!, leftOffsetIn } as HookSpec)}
          />
        </div>
      ) : null}
      {piece.hookSpec?.count === 2 ? (
        <>
          <NumberField
            label={`${piece.label} hooks down from top`}
            displayLabel="Down from top"
            valueIn={piece.hookSpec.topOffsetIn}
            unit={unit}
            onUnitChange={onUnitChange}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
            onChange={(topOffsetIn) => onChange({ ...piece.hookSpec!, topOffsetIn } as HookSpec)}
          />
          <div className="field-grid">
            <NumberField
              label={`${piece.label} left hook from left side`}
              displayLabel="From left"
              valueIn={piece.hookSpec.leftSideOffsetIn}
              unit={unit}
              onUnitChange={onUnitChange}
              onEditStart={onEditStart}
              onEditEnd={onEditEnd}
              onChange={(leftSideOffsetIn) =>
                onChange({ ...piece.hookSpec!, leftSideOffsetIn } as HookSpec)
              }
            />
            <NumberField
              label={`${piece.label} right hook from right side`}
              displayLabel="From right"
              valueIn={piece.hookSpec.rightSideOffsetIn}
              unit={unit}
              onUnitChange={onUnitChange}
              onEditStart={onEditStart}
              onEditEnd={onEditEnd}
              onChange={(rightSideOffsetIn) =>
                onChange({ ...piece.hookSpec!, rightSideOffsetIn } as HookSpec)
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
