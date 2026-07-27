import { Download, FileImage, FileJson, FileText, Upload } from 'lucide-react';
import { CollapsiblePanel } from './CollapsiblePanel';
import { HeadingWithInfo } from './InfoTooltip';

export function ExportPanel({
  ready,
  issues,
  exporting,
  onExportPng,
  onExportPdf,
  onExportJson,
  onImportClick,
  className,
}: {
  ready: boolean;
  issues: string[];
  exporting: 'png' | 'pdf' | null;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onImportClick: () => void;
  className?: string;
}) {
  const printExportRequirement = ready
    ? exporting
      ? 'A print export is already in progress.'
      : 'Export the print layout.'
    : `Complete export requirements: ${issues.join(' ')}`;

  return (
    <CollapsiblePanel
      icon={<Download size={18} />}
      title="Design files"
      ariaLabel="Design file settings"
      className={className}
    >
      <div className="export-section">
        <HeadingWithInfo
          label="Print/export layout"
          info="PNG and PDF exports include the visual layout, piece table, and installation measurements."
        />
        {issues.length > 0 ? (
          <ul className="issue-list" role="alert" aria-live="assertive">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        <div className="export-actions">
          <button
            type="button"
            className="secondary"
            disabled={!ready || exporting !== null}
            aria-busy={exporting === 'png'}
            title={printExportRequirement}
            onClick={onExportPng}
          >
            <FileImage size={18} />
            Export PNG
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!ready || exporting !== null}
            aria-busy={exporting === 'pdf'}
            title={printExportRequirement}
            onClick={onExportPdf}
          >
            <FileText size={18} />
            Export PDF
          </button>
        </div>
      </div>
      <div className="export-section">
        <HeadingWithInfo
          label="Save/load design"
          info="JSON is the editable project file for reopening this design and continuing later."
        />
        <div className="export-actions">
          <button type="button" className="secondary" onClick={onExportJson}>
            <FileJson size={18} />
            Export JSON
          </button>
          <button type="button" className="secondary" onClick={onImportClick}>
            <Upload size={18} />
            Import JSON
          </button>
        </div>
      </div>
      <p className="muted feature-help scale-note">
        Print exports are for installation; JSON files are for editing this design later.
      </p>
    </CollapsiblePanel>
  );
}
