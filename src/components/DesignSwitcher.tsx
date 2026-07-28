import { ChevronDown, FolderOpen, Plus, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DesignSummary } from '../lib/designLibrary';

export function DesignSwitcher({
  activeDesignId,
  designs,
  onSwitch,
  onNewDesign,
  onManage,
}: {
  activeDesignId: string;
  designs: DesignSummary[];
  onSwitch: (id: string) => void;
  onNewDesign: () => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeDesign = designs.find((design) => design.id === activeDesignId);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      const menu = menuRef.current;
      if (!menu || !(event.target instanceof Node) || menu.contains(event.target)) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown);
  }, [open]);

  return (
    <div className="design-switcher" ref={menuRef}>
      <button
        type="button"
        className="secondary design-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        <FolderOpen size={16} aria-hidden="true" focusable="false" />
        <span className="design-switcher-name">{activeDesign?.name ?? 'Design'}</span>
        <ChevronDown size={14} aria-hidden="true" focusable="false" />
      </button>
      {open ? (
        <div className="design-switcher-popover" role="menu" aria-label="Designs">
          {designs.map((design) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={design.id === activeDesignId}
              className={
                design.id === activeDesignId
                  ? 'design-switcher-item design-switcher-item-active'
                  : 'design-switcher-item'
              }
              key={design.id}
              onClick={() => {
                setOpen(false);
                if (design.id !== activeDesignId) {
                  onSwitch(design.id);
                }
              }}
            >
              {design.name}
            </button>
          ))}
          <div className="design-switcher-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="design-switcher-item"
            onClick={() => {
              setOpen(false);
              onNewDesign();
            }}
          >
            <Plus size={14} aria-hidden="true" focusable="false" />
            New design
          </button>
          <button
            type="button"
            role="menuitem"
            className="design-switcher-item"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            <Settings size={14} aria-hidden="true" focusable="false" />
            Manage designs…
          </button>
        </div>
      ) : null}
    </div>
  );
}
