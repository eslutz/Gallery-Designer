import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * A true modal dialog: portaled to document.body, focus-trapped, closes on
 * Escape or backdrop click, and restores focus to whatever triggered it.
 * Unlike AdvancedDrawer/PlacementSettingsDrawer (which stay mounted for
 * their slide transition and have none of this), this unmounts entirely
 * when closed — there's no persistent-panel reason to keep it around.
 */
export function ModalDialog({
  open,
  onClose,
  title,
  titleIcon,
  children,
  footer,
  initialFocusRef,
  size = 'md',
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Prefer the body's own content over the header's close button, so focus
    // lands on the dialog's actual purpose rather than immediately on Dismiss.
    const bodyElement = dialogRef.current?.querySelector<HTMLElement>('.modal-body');
    const focusTarget =
      initialFocusRef?.current ??
      bodyElement?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialogRef.current;
    focusTarget?.focus();

    return () => {
      previouslyFocusedRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on open/close transitions
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable || focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !dialogRef.current?.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="modal-layer">
      <button
        type="button"
        className="modal-backdrop"
        aria-label={`Dismiss ${title}`}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={`modal-dialog modal-dialog-${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <div className="panel-title">
            {titleIcon}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
