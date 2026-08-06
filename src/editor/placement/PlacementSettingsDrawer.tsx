import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect } from 'react';
import type { AutoPlacementSettings, Unit, UndoableChangeOptions } from '../../types';
import { AutoPlacementControls } from './AutoPlacementControls';

export function PlacementSettingsDrawer({
  open,
  settings,
  selectedFeatureId,
  unit,
  onClose,
  onSettingsChange,
  onFeatureSelect,
  onUnitChange,
  onEditStart,
  onEditEnd,
}: {
  open: boolean;
  settings: AutoPlacementSettings;
  selectedFeatureId: string;
  unit: Unit;
  onClose: () => void;
  onSettingsChange: (settings: AutoPlacementSettings, options?: UndoableChangeOptions) => void;
  onFeatureSelect: (featureId: string) => void;
  onUnitChange: (unit: Unit) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <div
      className={`advanced-drawer-layer placement-settings-drawer-layer${open ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className="advanced-drawer-backdrop"
        aria-label="Close auto-placement settings"
        onClick={onClose}
      />
      <aside
        className="advanced-drawer placement-settings-drawer"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-label="Auto-placement settings"
      >
        <div className="advanced-drawer-header">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <h2>Auto-placement settings</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close auto-placement settings"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <AutoPlacementControls
          settings={settings}
          selectedFeatureId={selectedFeatureId}
          unit={unit}
          onUnitChange={onUnitChange}
          onChange={onSettingsChange}
          onFeatureSelect={onFeatureSelect}
          onEditStart={onEditStart}
          onEditEnd={onEditEnd}
        />
      </aside>
    </div>
  );
}
