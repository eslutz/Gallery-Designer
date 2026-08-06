import { AlertTriangle, Info, X } from 'lucide-react';
import type { MessageTone } from '../editor/state/galleryState';

export function MessageToast({
  message,
  details,
  tone,
  visible,
  onDismiss,
}: {
  message: string;
  details?: string;
  tone: MessageTone;
  visible: boolean;
  onDismiss: () => void;
}) {
  // The region stays mounted so assistive tech is already observing it; the
  // toast itself mounts and unmounts, and that insertion is what triggers the
  // announcement. Toggling visibility on the region instead would take it out
  // of the accessibility tree, which is the unreliable case for live regions.
  return (
    <div className="message-toast-region" role="status" aria-live="polite">
      {visible ? (
        <div className={`message-toast ${tone}`}>
          {tone === 'error' ? (
            <AlertTriangle size={16} className="message-toast-icon" aria-hidden="true" />
          ) : (
            <Info size={16} className="message-toast-icon" aria-hidden="true" />
          )}
          <p className="message-toast-text">{message}</p>
          {details ? <span className="visually-hidden">{details}</span> : null}
          <button
            type="button"
            className="message-toast-dismiss"
            aria-label={`Dismiss notification: ${message}`}
            onClick={onDismiss}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
