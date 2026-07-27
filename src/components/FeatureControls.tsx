import type { EditorFeatures, Unit, UndoableChangeOptions } from '../types';
import { ToggleFieldWithInfo } from './InfoTooltip';
import { NumberField } from './NumberField';

export function FeatureControls({
  features,
  unit,
  onUnitChange,
  onChange,
  onEditStart,
  onEditEnd,
}: {
  features: EditorFeatures;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onChange: (patch: Partial<EditorFeatures>, options?: UndoableChangeOptions) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  const unitLabel = unit;

  return (
    <>
      <ToggleFieldWithInfo
        label="Snap to grid"
        checked={features.snapToGrid}
        info="Pieces snap to grid increments while dragging or nudging. Grid size is the increment used when grid snapping is enabled."
        onChange={(checked) => onChange({ snapToGrid: checked })}
      />
      <NumberField
        label={`Grid size (${unitLabel})`}
        displayLabel="Grid size"
        valueIn={features.gridSizeIn}
        unit={unit}
        precision="size"
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(gridSizeIn) =>
          onChange({ gridSizeIn: Math.max(0.125, gridSizeIn) }, { undoable: false })
        }
      />
      <p className="muted feature-help">Snap settings apply while dragging or nudging pieces.</p>
      <ToggleFieldWithInfo
        label="Snap to alignment"
        checked={features.snapToAlignment}
        info="Pieces snap to the edges and centers of nearby artwork and furniture with a clear line of sight — not to the wall's own edges. Alignment tolerance controls how close a piece must be before snapping engages."
        onChange={(checked) => onChange({ snapToAlignment: checked })}
      />
      <ToggleFieldWithInfo
        label="Show alignment guides"
        checked={features.showAlignmentGuides}
        info="Shows dotted guide lines when alignment snapping engages. Turn this off to keep snapping without the visual guides."
        onChange={(checked) => onChange({ showAlignmentGuides: checked })}
      />
      <NumberField
        label={`Alignment tolerance (${unitLabel})`}
        displayLabel="Alignment tolerance"
        valueIn={features.alignmentToleranceIn}
        unit={unit}
        precision="size"
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(alignmentToleranceIn) =>
          onChange(
            { alignmentToleranceIn: Math.max(0.125, alignmentToleranceIn) },
            { undoable: false },
          )
        }
      />
      <ToggleFieldWithInfo
        label="Wall edge buffer"
        checked={features.wallEdgeBuffer}
        info="Wall edge buffer reserves clearance from wall edges. The buffer gap sets the clearance distance used when wall edge buffer is enabled."
        onChange={(checked) => onChange({ wallEdgeBuffer: checked })}
      />
      <NumberField
        label={`Wall edge buffer gap (${unitLabel})`}
        displayLabel="Wall edge buffer gap"
        valueIn={features.wallEdgeBufferGapIn}
        unit={unit}
        precision="size"
        disabled={!features.wallEdgeBuffer}
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(wallEdgeBufferGapIn) =>
          onChange(
            { wallEdgeBufferGapIn: Math.max(0.125, wallEdgeBufferGapIn) },
            { undoable: false },
          )
        }
      />
      <ToggleFieldWithInfo
        label="Art piece buffer"
        checked={features.artPieceBuffer}
        info="Art piece buffer reserves spacing between artwork. The buffer gap sets the spacing distance used when art piece buffer is enabled."
        onChange={(checked) => onChange({ artPieceBuffer: checked })}
      />
      <NumberField
        label={`Art piece buffer gap (${unitLabel})`}
        displayLabel="Art piece buffer gap"
        valueIn={features.artPieceBufferGapIn}
        unit={unit}
        precision="size"
        disabled={!features.artPieceBuffer}
        onUnitChange={onUnitChange}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
        onChange={(artPieceBufferGapIn) =>
          onChange(
            { artPieceBufferGapIn: Math.max(0.125, artPieceBufferGapIn) },
            { undoable: false },
          )
        }
      />
      <ToggleFieldWithInfo
        label="Use absolute installation measurements"
        checked={features.measurementReferenceMode === 'absolute'}
        info="Relative measurements reference the closest edge or neighbor. Absolute measurements use the continuous wall's top-left origin."
        onChange={(checked) =>
          onChange({
            measurementReferenceMode: checked ? 'absolute' : 'relative',
          })
        }
      />
    </>
  );
}
