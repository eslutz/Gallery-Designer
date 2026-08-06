import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileImage, FileJson, FileText, Upload } from 'lucide-react';
import { CollapsiblePanel } from './CollapsiblePanel';
import { HeadingWithInfo } from './InfoTooltip';

export function ExportPanel({
  ready,
  issues,
  exporting,
  onExportPng,
  onExportPdf,
  onExportJson,
  onExportAllJson,
  onImportClick,
  className,
}: {
  ready: boolean;
  issues: string[];
  exporting: 'png' | 'pdf' | null;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onExportAllJson?: () => void;
  onImportClick: () => void;
  className?: string;
}) {
  const [jsonMenuOpen, setJsonMenuOpen] = useState(false);
  const jsonMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jsonMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!jsonMenuRef.current?.contains(event.target as Node)) setJsonMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setJsonMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [jsonMenuOpen]);

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
          info="JSON is the editable project file for reopening the current design; all-design backups restore every saved design."
        />
        <div className="export-actions">
          <div className="json-export-split" ref={jsonMenuRef}>
            <button
              type="button"
              className="secondary json-export-primary"
              aria-label="Export current design"
              onClick={onExportJson}
            >
              <FileJson size={18} />
              Export
            </button>
            <button
              type="button"
              className="secondary json-export-menu-trigger"
              aria-label="JSON export options"
              aria-haspopup="menu"
              aria-expanded={jsonMenuOpen}
              onClick={() => setJsonMenuOpen((open) => !open)}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {jsonMenuOpen ? (
              <div className="json-export-menu" role="menu" aria-label="JSON export options">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setJsonMenuOpen(false);
                    onExportJson();
                  }}
                >
                  Export current design
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setJsonMenuOpen(false);
                    onExportAllJson?.();
                  }}
                >
                  Export all designs
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="secondary" onClick={onImportClick}>
            <Upload size={18} />
            Import JSON
          </button>
        </div>
      </div>
      <p className="muted feature-help scale-note">
        Print exports are for installation; JSON files are for editing this design later. An
        all-design backup can restore the saved design library.
      </p>
    </CollapsiblePanel>
  );
}
