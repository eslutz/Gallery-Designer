import { Copy, FolderCog, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  loadDesignState,
  summarizeDesign,
  type DesignLibrary,
  type DesignSummary,
} from './designLibrary';
import { ModalDialog } from '../../shared/ui/ModalDialog';

function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) {
    return '';
  }
  const diffMinutes = Math.round((Date.now() - timestamp) / 60_000);
  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function ManageDesignsDialog({
  open,
  onClose,
  library,
  onRename,
  onDuplicate,
  onDelete,
  onNewDesign,
}: {
  open: boolean;
  onClose: () => void;
  library: DesignLibrary;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onNewDesign: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  function startRename(design: DesignSummary) {
    setConfirmingDeleteId(null);
    setRenamingId(design.id);
    setRenameValue(design.name);
  }

  function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRename(id, trimmed);
    }
    setRenamingId(null);
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Manage designs"
      titleIcon={<FolderCog size={18} aria-hidden="true" focusable="false" />}
      size="lg"
      footer={
        <button type="button" className="secondary" onClick={onNewDesign}>
          <Plus size={14} aria-hidden="true" focusable="false" />
          New design
        </button>
      }
    >
      <ul className="design-manager-list">
        {library.designs.map((design) => {
          const summary = summarizeDesign(loadDesignState(design.id));
          const isActive = design.id === library.activeId;
          const isRenaming = renamingId === design.id;
          const isConfirmingDelete = confirmingDeleteId === design.id;

          return (
            <li
              key={design.id}
              className={
                isActive ? 'design-manager-row design-manager-row-active' : 'design-manager-row'
              }
            >
              {isRenaming ? (
                <form
                  className="design-manager-rename-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitRename(design.id);
                  }}
                >
                  <label className="visually-hidden" htmlFor={`design-rename-${design.id}`}>
                    Design name
                  </label>
                  <input
                    id={`design-rename-${design.id}`}
                    value={renameValue}
                    autoFocus
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setRenamingId(null);
                      }
                    }}
                  />
                  <button type="submit" className="secondary">
                    Save
                  </button>
                  <button type="button" className="secondary" onClick={() => setRenamingId(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="design-manager-info">
                  <span className="design-manager-name">
                    {design.name}
                    {isActive ? <span className="design-manager-current"> (current)</span> : null}
                  </span>
                  <span className="design-manager-meta">
                    {summary.sectionCount} section{summary.sectionCount === 1 ? '' : 's'} ·{' '}
                    {summary.pieceCount} piece{summary.pieceCount === 1 ? '' : 's'} · updated{' '}
                    {formatRelativeTime(design.updatedAt)}
                  </span>
                </div>
              )}

              {isConfirmingDelete ? (
                <div className="design-manager-confirm">
                  <span>Delete “{design.name}”?</span>
                  <button
                    type="button"
                    className="design-manager-delete-confirm"
                    onClick={() => {
                      setConfirmingDeleteId(null);
                      onDelete(design.id);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setConfirmingDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : isRenaming ? null : (
                <div className="design-manager-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Rename ${design.name}`}
                    onClick={() => startRename(design)}
                  >
                    <Pencil size={16} aria-hidden="true" focusable="false" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Duplicate ${design.name}`}
                    onClick={() => onDuplicate(design.id)}
                  >
                    <Copy size={16} aria-hidden="true" focusable="false" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${design.name}`}
                    disabled={library.designs.length <= 1}
                    onClick={() => setConfirmingDeleteId(design.id)}
                  >
                    <Trash2 size={16} aria-hidden="true" focusable="false" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </ModalDialog>
  );
}
