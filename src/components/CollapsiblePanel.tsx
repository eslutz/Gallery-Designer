import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function CollapsiblePanel({
  icon,
  title,
  badge,
  ariaLabel,
  defaultExpanded = true,
  className = '',
  contentClassName = '',
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: string | number;
  ariaLabel: string;
  defaultExpanded?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <section
      className={`utility-panel feature-panel collapsible-panel ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="collapsible-panel-trigger"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="panel-title">
          {icon}
          <h2>{title}</h2>
          {badge !== undefined ? <span className="count-badge">{badge}</span> : null}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          focusable="false"
          className={expanded ? 'collapsible-panel-caret' : 'collapsible-panel-caret collapsed'}
        />
      </button>
      <div
        id={contentId}
        className={`collapsible-panel-content ${contentClassName}`.trim()}
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}
