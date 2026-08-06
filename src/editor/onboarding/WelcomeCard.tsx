import { useId, useState } from 'react';
import { ModalDialog } from '../../shared/ui/ModalDialog';

// Each step is a short title plus one supporting line — the earlier
// single-paragraph-per-step version turned into a wall of text that nobody
// would read on first open.
const STEPS = [
  {
    title: 'Measure your wall',
    detail:
      'Enter real dimensions for each section. Choose “Available sections” for open wall space, or “Full wall with features” to work around furniture, doors, and windows.',
  },
  {
    title: 'Add your art',
    detail: 'Give each piece a label, width, and height.',
  },
  {
    title: 'Lay it out',
    detail: 'Drag pieces onto the wall, or let “Auto-place pieces” arrange them for you.',
  },
  {
    title: 'Export the plan',
    detail:
      'PDF or PNG gives you a measured sheet to hang from. JSON saves or backs up the whole design.',
  },
  {
    title: 'Plan more walls',
    detail: 'Use the design switcher up top to start another design without losing this one.',
  },
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
      <p className="welcome-card-intro">Plan a gallery wall to scale in a few steps:</p>
      <ol className="welcome-card-steps">
        {STEPS.map((step) => (
          <li key={step.title}>
            <span className="welcome-card-step-title">{step.title}</span>
            <span className="welcome-card-step-detail">{step.detail}</span>
          </li>
        ))}
      </ol>
    </ModalDialog>
  );
}
