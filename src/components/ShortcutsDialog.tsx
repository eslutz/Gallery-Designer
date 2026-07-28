import { Keyboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  formatShortcutKey,
  isApplePlatform,
  shortcutGroups,
  type ShortcutKey,
} from '../lib/keyboardShortcuts';
import { ModalDialog } from './ModalDialog';

function ShortcutKeys({ keys, apple }: { keys: ShortcutKey[]; apple: boolean }) {
  return (
    <span className="shortcut-keys">
      {keys.map((key, index) => (
        <kbd key={index} className="shortcut-key">
          {formatShortcutKey(key, apple)}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog({
  open,
  onClose,
  onShowWelcomeGuide,
}: {
  open: boolean;
  onClose: () => void;
  onShowWelcomeGuide: () => void;
}) {
  const [apple, setApple] = useState(false);

  useEffect(() => {
    setApple(isApplePlatform());
  }, []);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      titleIcon={<Keyboard size={18} />}
      size="lg"
      footer={
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onClose();
            onShowWelcomeGuide();
          }}
        >
          Show welcome guide
        </button>
      }
    >
      {shortcutGroups.map((group) => (
        <section key={group.title} className="shortcut-group" aria-label={group.title}>
          <h3>{group.title}</h3>
          <dl className="shortcut-list">
            {group.shortcuts.map((shortcut) => (
              <div className="shortcut-row" key={shortcut.description}>
                <dt>
                  <ShortcutKeys keys={shortcut.keys} apple={apple} />
                </dt>
                <dd>{shortcut.description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </ModalDialog>
  );
}
