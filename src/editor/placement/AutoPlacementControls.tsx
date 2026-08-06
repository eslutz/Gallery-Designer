import { Plus, Trash2 } from 'lucide-react';
import {
  getNextWallFeatureName,
  getWallFeatureRemoveTooltip,
  isDefaultWallFeatureName,
} from '../wall/featureNaming';
import { getWallFeatureDefaults } from '../wall/features';
import { formatMeasurement } from '../../shared/format/units';
import type {
  AutoPlacementLayoutPreference,
  AutoPlacementSettings,
  Unit,
  UndoableChangeOptions,
  WallFeature,
  WallFeatureType,
} from '../../types';
import { FieldLabelWithInfo, TooltipIconButton } from '../../shared/ui/InfoTooltip';
import { NumberField } from '../../shared/ui/NumberField';

export function AutoPlacementControls({
  settings,
  selectedFeatureId,
  unit,
  onUnitChange,
  onChange,
  onFeatureSelect,
  onEditStart,
  onEditEnd,
}: {
  settings: AutoPlacementSettings;
  selectedFeatureId: string;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onChange: (settings: AutoPlacementSettings, options?: UndoableChangeOptions) => void;
  onFeatureSelect: (featureId: string) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  function updateFeature(
    featureId: string,
    patch: Partial<WallFeature>,
    options?: UndoableChangeOptions,
  ) {
    onChange(
      {
        ...settings,
        wallFeatures: settings.wallFeatures.map((feature) =>
          feature.id === featureId ? { ...feature, ...patch } : feature,
        ),
      },
      options,
    );
  }

  function addFeature() {
    const index = settings.wallFeatures.length + 1;
    const featureId = `feature-${Date.now()}-${index}`;
    const type: WallFeatureType = 'sofa';
    const defaults = getWallFeatureDefaults(type);
    onFeatureSelect(featureId);
    onChange({
      ...settings,
      wallFeatures: [
        ...settings.wallFeatures,
        {
          id: featureId,
          type,
          name: getNextWallFeatureName(type, settings.wallFeatures),
          xIn: 0,
          yIn: 0,
          ...defaults,
          placed: false,
        },
      ],
    });
  }

  function removeFeature(featureId: string) {
    if (selectedFeatureId === featureId) {
      onFeatureSelect('');
    }
    onChange({
      ...settings,
      wallFeatures: settings.wallFeatures.filter((feature) => feature.id !== featureId),
    });
  }

  return (
    <>
      <div className="field">
        <FieldLabelWithInfo
          htmlFor="auto-placement-layout"
          label="Layout"
          info="Layout chooses the auto-placement pattern. Auto picks a pattern from your art sizes; Grid, Row, Stack, and Salon force that layout style."
        />
        <select
          id="auto-placement-layout"
          value={settings.layoutPreference}
          onChange={(event) =>
            onChange({
              ...settings,
              layoutPreference: event.target.value as AutoPlacementLayoutPreference,
            })
          }
        >
          <option value="auto">Auto</option>
          <option value="grid">Grid</option>
          <option value="row">Row</option>
          <option value="stack">Stack</option>
          <option value="salon">Salon</option>
        </select>
      </div>
      <div className="field">
        <FieldLabelWithInfo
          htmlFor="auto-placement-wall-setup"
          label="Wall setup"
          info="Available wall sections uses the wall spans you can actually hang art on. Full wall + furniture and features starts from one continuous wall, then keeps art clear of placed sofas, consoles, doors, windows, and other features."
        />
        <select
          id="auto-placement-wall-setup"
          value={settings.wallSetupMode}
          onChange={(event) =>
            onChange({
              ...settings,
              wallSetupMode: event.target.value as AutoPlacementSettings['wallSetupMode'],
            })
          }
        >
          <option value="available-sections">Available wall sections</option>
          <option value="full-wall-with-features">Full wall + furniture and features</option>
        </select>
      </div>
      <div className="field">
        <FieldLabelWithInfo
          htmlFor="auto-placement-context"
          label="Context"
          info="Context sets placement priorities around your wall. Choose a hallway for quick pass-by viewing, or a blank wall for a more relaxed display."
        />
        <select
          id="auto-placement-context"
          value={settings.context.kind}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'hallway') {
              onChange({ ...settings, context: { kind: 'hallway' } });
              return;
            }
            onChange({ ...settings, context: { kind: 'blank', viewingPosture: 'seated' } });
          }}
        >
          <option value="blank">Blank wall</option>
          <option value="hallway">Hallway</option>
        </select>
      </div>
      {settings.context.kind === 'blank' ? (
        <div className="field">
          <FieldLabelWithInfo
            htmlFor="auto-placement-viewing-height"
            label="Viewing height"
            info="Viewing height shifts the group vertically toward the height where people will usually see it. It does not change your wall dimensions."
          />
          <select
            id="auto-placement-viewing-height"
            value={settings.context.viewingPosture}
            onChange={(event) =>
              onChange({
                ...settings,
                context: {
                  kind: 'blank',
                  viewingPosture: event.target.value as 'seated' | 'standing',
                },
              })
            }
          >
            <option value="seated">Seated</option>
            <option value="standing">Standing</option>
          </select>
        </div>
      ) : null}
      {settings.wallSetupMode === 'full-wall-with-features' ? (
        <div className="section-list" aria-label="Furniture and wall features">
          <div className="panel-title compact">
            <h3>Furniture & Wall Features</h3>
          </div>
          {settings.wallFeatures.map((feature, index) => {
            const selected = selectedFeatureId === feature.id;

            return (
              <article
                className={`setup-row feature-row ${selected ? 'selected expanded' : 'collapsed'}`}
                key={feature.id}
                onClick={(event) => {
                  if (
                    event.target instanceof HTMLElement &&
                    event.target.closest('input, select, button')
                  ) {
                    return;
                  }
                  onFeatureSelect(feature.id);
                }}
              >
                <div className="row-heading">
                  {selected ? (
                    <input
                      aria-label={`Feature ${index + 1} name`}
                      value={feature.name}
                      onFocus={() => {
                        onEditStart();
                        onFeatureSelect(feature.id);
                      }}
                      onBlur={onEditEnd}
                      onChange={(event) =>
                        updateFeature(feature.id, { name: event.target.value }, { undoable: false })
                      }
                    />
                  ) : (
                    <div className="row-name-readonly" aria-label={`Feature ${index + 1} name`}>
                      {feature.name}
                    </div>
                  )}
                  <TooltipIconButton
                    ariaLabel={`Remove ${feature.name}`}
                    tooltip={getWallFeatureRemoveTooltip(feature.type)}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFeature(feature.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </TooltipIconButton>
                </div>
                <p className="row-summary">
                  {formatMeasurement(feature.widthIn, unit)} x{' '}
                  {formatMeasurement(feature.heightIn, unit)}
                </p>
                <label className="field">
                  Type
                  <select
                    aria-label={`Feature ${index + 1} type`}
                    value={feature.type}
                    onFocus={() => onFeatureSelect(feature.id)}
                    onChange={(event) => {
                      const type = event.target.value as WallFeatureType;
                      const shouldRename = isDefaultWallFeatureName(feature.name);
                      updateFeature(feature.id, {
                        type,
                        name: shouldRename
                          ? getNextWallFeatureName(type, settings.wallFeatures, feature.id)
                          : feature.name,
                        ...getWallFeatureDefaults(type),
                      });
                    }}
                  >
                    <option value="sofa">Sofa</option>
                    <option value="bed">Bed</option>
                    <option value="console">Console</option>
                    <option value="desk">Desk</option>
                    <option value="file-cabinet">File cabinet</option>
                    <option value="lamp">Lamp</option>
                    <option value="bookcase">Bookcase</option>
                    <option value="fireplace">Fireplace</option>
                    <option value="tv">TV</option>
                    <option value="window">Window</option>
                    <option value="door">Door</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <NumberField
                  label={`Feature ${index + 1} width (${unit})`}
                  displayLabel="Width"
                  valueIn={feature.widthIn}
                  unit={unit}
                  precision="size"
                  onUnitChange={onUnitChange}
                  onEditStart={onEditStart}
                  onEditEnd={onEditEnd}
                  onChange={(widthIn) =>
                    updateFeature(
                      feature.id,
                      { widthIn: Math.max(1, widthIn) },
                      { undoable: false },
                    )
                  }
                />
                <NumberField
                  label={`Feature ${index + 1} height (${unit})`}
                  displayLabel="Height"
                  valueIn={feature.heightIn}
                  unit={unit}
                  precision="size"
                  onUnitChange={onUnitChange}
                  onEditStart={onEditStart}
                  onEditEnd={onEditEnd}
                  onChange={(heightIn) =>
                    updateFeature(
                      feature.id,
                      { heightIn: Math.max(0, heightIn) },
                      { undoable: false },
                    )
                  }
                />
                <NumberField
                  label={`Feature ${index + 1} clearance (${unit})`}
                  displayLabel="Clearance"
                  valueIn={
                    feature.clearanceOverrideIn ??
                    getWallFeatureDefaults(feature.type).clearanceOverrideIn
                  }
                  unit={unit}
                  precision="size"
                  onUnitChange={onUnitChange}
                  onEditStart={onEditStart}
                  onEditEnd={onEditEnd}
                  onChange={(clearanceOverrideIn) =>
                    updateFeature(
                      feature.id,
                      {
                        clearanceOverrideIn: Math.max(0, clearanceOverrideIn),
                      },
                      { undoable: false },
                    )
                  }
                />
              </article>
            );
          })}
          <button type="button" className="secondary full-width" onClick={addFeature}>
            <Plus size={16} />
            Add furniture or feature
          </button>
        </div>
      ) : null}
    </>
  );
}
