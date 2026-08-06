import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect } from 'react';
import {
  applicationThemeOptions,
  resolveApplicationTheme,
  type ApplicationTheme,
} from '../lib/applicationTheme';
import type { AutoPlacementDiagnostics } from '../lib/autoPlace';
import type { EditorFeatures, ThemeMode, Unit, UndoableChangeOptions } from '../types';
import { AutoPlacementFailureDetails } from './AutoPlacementFailureDetails';
import { CollapsiblePanel } from './CollapsiblePanel';
import { ExportPanel } from './ExportPanel';
import { FeatureControls } from './FeatureControls';

export function AdvancedDrawer({
  open,
  themeMode,
  applicationTheme,
  features,
  unit,
  message,
  autoPlacementFailure,
  readyToExport,
  exportIssues,
  exporting,
  onClose,
  onThemeModeChange,
  onApplicationThemeChange,
  onFeaturesChange,
  onExportPng,
  onExportPdf,
  onExportJson,
  onExportAllJson,
  onImportClick,
  onUnitChange,
  onEditStart,
  onEditEnd,
}: {
  open: boolean;
  themeMode: ThemeMode;
  applicationTheme: ApplicationTheme;
  features: EditorFeatures;
  unit: Unit;
  message: string;
  autoPlacementFailure: { message: string; diagnostics: AutoPlacementDiagnostics } | null;
  readyToExport: boolean;
  exportIssues: string[];
  exporting: 'png' | 'pdf' | null;
  onClose: () => void;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  onApplicationThemeChange: (applicationTheme: ApplicationTheme) => void;
  onFeaturesChange: (patch: Partial<EditorFeatures>, options?: UndoableChangeOptions) => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onExportAllJson: () => void;
  onImportClick: () => void;
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
    <div className={`advanced-drawer-layer${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="advanced-drawer-backdrop"
        aria-label="Close advanced settings"
        onClick={onClose}
      />
      <aside
        className="advanced-drawer"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-label="Advanced"
      >
        <div className="advanced-drawer-header">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <h2>Advanced</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close Advanced"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <section className="utility-panel feature-panel" aria-label="Appearance controls">
          <div className="panel-title">
            <h2>Appearance</h2>
          </div>
          <label className="field">
            Appearance
            <select
              value={themeMode}
              onChange={(event) => onThemeModeChange(event.target.value as ThemeMode)}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="field">
            Theme
            <select
              value={applicationTheme}
              onChange={(event) =>
                onApplicationThemeChange(resolveApplicationTheme(event.target.value))
              }
            >
              {applicationThemeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        <CollapsiblePanel
          icon={<SlidersHorizontal size={18} />}
          title="Features"
          ariaLabel="Feature settings"
        >
          <FeatureControls
            features={features}
            unit={unit}
            onUnitChange={onUnitChange}
            onChange={onFeaturesChange}
            onEditStart={onEditStart}
            onEditEnd={onEditEnd}
          />
        </CollapsiblePanel>
        <section className="status-panel" aria-label="Latest update">
          <p className="status-panel-label">Latest update</p>
          <div className="status-content" role={open ? 'status' : undefined} aria-live="polite">
            <p className="status-message">{message}</p>
            {autoPlacementFailure?.message === message ? (
              <AutoPlacementFailureDetails
                diagnostics={autoPlacementFailure.diagnostics}
                unit={unit}
              />
            ) : null}
          </div>
        </section>
        <ExportPanel
          ready={readyToExport}
          issues={exportIssues}
          exporting={exporting}
          onExportPng={onExportPng}
          onExportPdf={onExportPdf}
          onExportJson={onExportJson}
          onExportAllJson={onExportAllJson}
          onImportClick={onImportClick}
        />
      </aside>
    </div>
  );
}
