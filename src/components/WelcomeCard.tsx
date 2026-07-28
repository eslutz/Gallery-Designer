import { useId, useState } from 'react';
import { ModalDialog } from './ModalDialog';

const STEPS = [
  'Set up your wall sections with real dimensions. Choose “Available sections” for open wall space, or “Full wall with features” to also account for furniture, doors, and windows.',
  'Add each art piece with its label, width, and height.',
  'Drag pieces onto the wall, or click “Auto-place pieces” to lay them out for you.',
  'Export a PDF or PNG installation plan to take with you when hanging the art, or a JSON file to save or back up the whole design.',
  'Use the design switcher in the top right to start additional designs — for other rooms or layout options — without losing this one.',
];

export function WelcomeCard({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: (dontShowAgain: boolean) => void;
}) {
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const checkboxId = useId();

  return (
    <ModalDialog
      open={open}
      onClose={() => onDismiss(dontShowAgain)}
      title="Welcome to Gallery Designer"
      footer={
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
      }
    >
      <p>Plan a gallery wall to scale in a few steps:</p>
      <ol className="welcome-card-steps">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </ModalDialog>
  );
}
