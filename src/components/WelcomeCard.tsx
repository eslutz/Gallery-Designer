import { X } from 'lucide-react';
import { useId, useState } from 'react';

const STEPS = [
  'Set up your wall sections with real dimensions.',
  'Add each art piece with its label, width, and height.',
  'Drag pieces onto the wall, or click “Auto-place pieces” to lay them out for you.',
  'Review the measurements, then export the plan as a PDF, PNG, or JSON file.',
];

/**
 * An orienting overlay for a first-time visitor, not a modal: it must not
 * trap focus or block the setup panel behind it, since someone may want to
 * start filling in wall dimensions while it's still open.
 */
export function WelcomeCard({ onDismiss }: { onDismiss: (dontShowAgain: boolean) => void }) {
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const checkboxId = useId();
  const headingId = useId();

  return (
    <div className="welcome-card" role="region" aria-labelledby={headingId}>
      <button
        type="button"
        className="icon-button welcome-card-close"
        aria-label="Close welcome guide"
        onClick={() => onDismiss(dontShowAgain)}
      >
        <X size={18} aria-hidden="true" focusable="false" />
      </button>
      <h2 id={headingId}>Welcome to Gallery Designer</h2>
      <p>Plan a gallery wall to scale in a few steps:</p>
      <ol className="welcome-card-steps">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="welcome-card-footer">
        <label className="welcome-card-checkbox">
          <input
            id={checkboxId}
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
          />
          Don&rsquo;t show this again
        </label>
        <button type="button" className="primary" onClick={() => onDismiss(dontShowAgain)}>
          Start designing
        </button>
      </div>
    </div>
  );
}
